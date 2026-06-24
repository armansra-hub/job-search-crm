/****************************************************************************
 * Job-Search Accountability CRM — Google Apps Script (background half)
 *
 * Bound to YOUR Gmail account. Runs on time-driven triggers, fully independent
 * of the Vercel web app (it does not need the website to be up). It:
 *   - watches Gmail for mail from tracked companies (every ~15 min),
 *   - classifies each thread with Claude (Haiku),
 *   - matches mail to an application by sender domain, asking Claude only when
 *     the domain is ambiguous; low-confidence matches are flagged needs_review
 *     instead of being applied silently,
 *   - writes email_events to Supabase, advances the application's stage, sets
 *     last_contact_at, and auto-creates a follow_up task when you owe a reply,
 *   - emails you immediately on each new meaningful event (deduped via the
 *     `notified` flag),
 *   - confirms your application was actually sent by scanning Sent mail,
 *   - sends a daily 8am digest.
 *
 * Talks to Supabase over its REST API using the SERVICE ROLE key (bypasses RLS).
 *
 * ── Setup (see README for the full walk-through) ──────────────────────────
 * 1. Script Properties (Project Settings ▸ Script Properties):
 *      SUPABASE_URL                e.g. https://abc.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY   the service_role secret (NOT the anon key)
 *      ANTHROPIC_API_KEY           sk-ant-...
 *      NOTIFY_EMAIL                where to send alerts (your email)
 *    Optional:
 *      USER_ID                     your Supabase auth user UUID (recommended;
 *                                  otherwise derived from your first application)
 *      ANTHROPIC_MODEL_FAST        defaults to claude-haiku-4-5
 *      STALE_DAYS                  digest "gone quiet" threshold, default 7
 *      WATCH_DAYS                  how far back to scan Gmail, default 2
 * 2. Run `installTriggers` once (authorize the scopes on the consent screen).
 * 3. Run `testConnection` to sanity-check Supabase + Anthropic.
 *
 * ── Honest caveats ────────────────────────────────────────────────────────
 * - LinkedIn notification emails usually have a TRUNCATED body — we flag the
 *   arrival and link it to a company when the subject/snippet names one, but we
 *   often can't see the full message. Read it in LinkedIn.
 * - Email→company matching is best-effort. Ambiguous mail becomes needs_review.
 * - Consumer Gmail quotas (~100 sends/day, ~20k UrlFetch/day) are plenty for
 *   one user as long as the Gmail search stays scoped (it does: tracked domains,
 *   last couple of days only).
 ****************************************************************************/

// ============================ Configuration =================================

function CONFIG_() {
  var props = PropertiesService.getScriptProperties();
  var cfg = {
    SUPABASE_URL: props.getProperty('SUPABASE_URL'),
    SERVICE_KEY: props.getProperty('SUPABASE_SERVICE_ROLE_KEY'),
    ANTHROPIC_KEY: props.getProperty('ANTHROPIC_API_KEY'),
    NOTIFY_EMAIL: props.getProperty('NOTIFY_EMAIL'),
    USER_ID: props.getProperty('USER_ID') || null,
    MODEL_FAST: props.getProperty('ANTHROPIC_MODEL_FAST') || 'claude-haiku-4-5',
    STALE_DAYS: parseInt(props.getProperty('STALE_DAYS') || '7', 10),
    WATCH_DAYS: parseInt(props.getProperty('WATCH_DAYS') || '2', 10),
  };
  ['SUPABASE_URL', 'SERVICE_KEY', 'ANTHROPIC_KEY', 'NOTIFY_EMAIL'].forEach(function (k) {
    if (!cfg[k]) throw new Error('Missing Script Property: ' + k);
  });
  return cfg;
}

var LINKEDIN_DOMAINS = ['linkedin.com', 'e.linkedin.com', 'bounce.linkedin.com'];

// ============================ Supabase REST =================================

function sbRequest_(cfg, method, pathAndQuery, body, extraPrefer) {
  var url = cfg.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + pathAndQuery;
  var headers = {
    apikey: cfg.SERVICE_KEY,
    Authorization: 'Bearer ' + cfg.SERVICE_KEY,
  };
  var prefer = ['return=representation'];
  if (extraPrefer) prefer.push(extraPrefer);
  headers['Prefer'] = prefer.join(',');

  var options = {
    method: method,
    headers: headers,
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body !== undefined && body !== null) options.payload = JSON.stringify(body);

  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) {
    throw new Error('Supabase ' + method + ' ' + pathAndQuery + ' -> ' + code + ': ' + text);
  }
  return text ? JSON.parse(text) : null;
}

function sbSelect_(cfg, table, query) {
  return sbRequest_(cfg, 'get', table + '?' + query, null) || [];
}
function sbInsert_(cfg, table, row, opts) {
  opts = opts || {};
  var path = table + (opts.onConflict ? '?on_conflict=' + opts.onConflict : '');
  return sbRequest_(cfg, 'post', path, row, opts.prefer);
}
function sbPatch_(cfg, table, filterQuery, patch) {
  return sbRequest_(cfg, 'patch', table + '?' + filterQuery, patch);
}

function getUserId_(cfg) {
  if (cfg.USER_ID) return cfg.USER_ID;
  // Fall back to the owner of the first application.
  var rows = sbSelect_(cfg, 'applications', 'select=user_id&limit=1');
  if (rows.length && rows[0].user_id) return rows[0].user_id;
  throw new Error(
    'Could not determine USER_ID. Set the USER_ID Script Property to your ' +
    'Supabase auth user id (Dashboard ▸ Authentication ▸ Users), or create an ' +
    'application in the web app first.'
  );
}

// ============================ Anthropic =====================================

function claudeText_(cfg, system, userText, maxTokens) {
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': cfg.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: cfg.MODEL_FAST,
      max_tokens: maxTokens || 400,
      system: system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) throw new Error('Anthropic ' + code + ': ' + text);
  var data = JSON.parse(text);
  return (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .trim();
}

// Extract the first JSON object from a model response, defensively.
function parseJsonLoose_(s) {
  try { return JSON.parse(s); } catch (e) {}
  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e2) {}
  }
  return null;
}

var VALID_CLASS = ['reply', 'interview_invite', 'rejection', 'linkedin_notice', 'other'];

function classifyEmail_(cfg, companyName, subject, body) {
  var sys =
    'You classify one inbound email related to a job application at "' + companyName + '". ' +
    'Choose EXACTLY one classification: reply (a human reply / acknowledgement), ' +
    'interview_invite (proposes a call/interview or asks for availability), ' +
    'rejection (declines/no longer considering), linkedin_notice (a LinkedIn ' +
    'notification), or other. Return ONLY JSON: {"classification":"..."}.';
  var out = claudeText_(cfg, sys, ('Subject: ' + subject + '\n\n' + body).slice(0, 4000), 100);
  var j = parseJsonLoose_(out);
  var c = j && j.classification;
  return VALID_CLASS.indexOf(c) >= 0 ? c : 'other';
}

// Ask Claude which tracked company (if any) an ambiguous email belongs to.
function matchCompany_(cfg, subject, snippet, companies) {
  var list = companies.map(function (c) { return '- ' + c.id + ': ' + c.name; }).join('\n');
  var sys =
    'An email arrived that did NOT match any tracked company by sender domain. ' +
    'Decide if it relates to one of these tracked applications:\n' + list + '\n\n' +
    'Be conservative: only match if you are reasonably sure. Return ONLY JSON: ' +
    '{"company_id": string|null, "classification": one of ' + JSON.stringify(VALID_CLASS) +
    ', "confidence": number between 0 and 1}.';
  var out = claudeText_(cfg, sys, ('Subject: ' + subject + '\n\n' + snippet).slice(0, 3000), 150);
  var j = parseJsonLoose_(out) || {};
  return {
    company_id: j.company_id || null,
    classification: VALID_CLASS.indexOf(j.classification) >= 0 ? j.classification : 'other',
    confidence: typeof j.confidence === 'number' ? j.confidence : 0,
  };
}

function summarizeThread_(cfg, threadText) {
  var sys =
    'Summarize this email thread for a job-search tracker in 1-2 sentences: ' +
    'who reached out, what they want, and what (if anything) the job seeker must ' +
    'do next. No preamble.';
  return claudeText_(cfg, sys, threadText.slice(0, 6000), 200);
}

// ============================ Helpers =======================================

function domainOfAddress_(addr) {
  if (!addr) return null;
  var m = String(addr).match(/<([^>]+)>/);
  var email = (m ? m[1] : addr).trim().toLowerCase();
  var at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : null;
}

function isLinkedInDomain_(domain) {
  if (!domain) return false;
  return LINKEDIN_DOMAINS.some(function (d) {
    return domain === d || domain.indexOf('.' + d) >= 0 || domain.indexOf('linkedin.com') >= 0;
  });
}

function threadText_(thread) {
  return thread.getMessages().map(function (m) {
    return 'From: ' + m.getFrom() + '\nDate: ' + m.getDate() + '\n' + m.getPlainBody();
  }).join('\n\n---\n\n');
}

function notify_(cfg, subject, body) {
  GmailApp.sendEmail(cfg.NOTIFY_EMAIL, subject, body, { name: 'Job-Search CRM' });
}

// Stage transitions driven by classification (only ever moves forward sanely).
function stageForClassification_(classification, currentStage) {
  switch (classification) {
    case 'interview_invite':
      return 'interview';
    case 'reply':
      // Don't downgrade someone already deeper in the funnel.
      return currentStage === 'applied' ? 'responded' : currentStage;
    case 'rejection':
      return 'rejected';
    default:
      return currentStage;
  }
}

function classificationNeedsFollowUp_(classification) {
  return classification === 'reply' || classification === 'interview_invite';
}

// ============================ Watcher (15-min) ==============================

function runWatcher() {
  var cfg = CONFIG_();
  var userId = getUserId_(cfg);

  var apps = sbSelect_(
    cfg,
    'applications',
    'select=id,company_name,email_domain,stage,last_contact_at&order=updated_at.desc'
  );
  if (!apps.length) {
    Logger.log('No applications tracked yet; nothing to watch.');
    return;
  }

  // Map sender-domain -> application (lowercased). Only domains we know.
  var domainMap = {};
  var domains = [];
  apps.forEach(function (a) {
    if (a.email_domain) {
      var d = String(a.email_domain).toLowerCase();
      domainMap[d] = a;
      if (domains.indexOf(d) < 0) domains.push(d);
    }
  });

  var companies = apps.map(function (a) { return { id: a.id, name: a.company_name }; });
  var processed = 0;

  // --- Pass A: mail from tracked company domains -----------------------------
  if (domains.length) {
    var fromQ = domains.map(function (d) { return 'from:@' + d; }).join(' OR ');
    var q = 'in:inbox newer_than:' + cfg.WATCH_DAYS + 'd (' + fromQ + ')';
    GmailApp.search(q, 0, 30).forEach(function (thread) {
      try {
        processed += handleThread_(cfg, userId, thread, apps, domainMap, companies, false) ? 1 : 0;
      } catch (e) {
        Logger.log('Thread error (domain pass): ' + e);
      }
    });
  }

  // --- Pass B: LinkedIn notifications (often truncated bodies) ----------------
  var liQ = 'in:inbox newer_than:' + cfg.WATCH_DAYS + 'd from:linkedin.com';
  GmailApp.search(liQ, 0, 20).forEach(function (thread) {
    try {
      processed += handleThread_(cfg, userId, thread, apps, domainMap, companies, true) ? 1 : 0;
    } catch (e) {
      Logger.log('Thread error (linkedin pass): ' + e);
    }
  });

  Logger.log('Watcher processed ' + processed + ' new/updated thread(s).');

  // Confirm application sends in the same run.
  try { processSentConfirmations_(cfg, userId, apps); } catch (e) { Logger.log('Sent-confirm error: ' + e); }
}

/**
 * Returns true if it wrote a NEW/updated event (i.e. there was a new message).
 */
function handleThread_(cfg, userId, thread, apps, domainMap, companies, isLinkedInPass) {
  var threadId = thread.getId();
  var messages = thread.getMessages();
  var last = messages[messages.length - 1];
  var lastDate = last.getDate();
  var subject = thread.getFirstMessageSubject() || '';
  var snippet = (last.getPlainBody() || '').slice(0, 800);
  var fromDomain = domainOfAddress_(last.getFrom());

  // Dedupe: have we already recorded this thread at this message time?
  var existing = sbSelect_(
    cfg,
    'email_events',
    'select=id,last_message_at,notified&user_id=eq.' + userId +
      '&gmail_thread_id=eq.' + encodeURIComponent(threadId) + '&limit=1'
  );
  if (existing.length && existing[0].last_message_at) {
    if (new Date(existing[0].last_message_at).getTime() >= lastDate.getTime()) {
      return false; // nothing new since last run
    }
  }

  // Resolve which application + classification this belongs to.
  var appRow = null;
  var classification = 'other';
  var needsReview = false;

  if (isLinkedInPass || isLinkedInDomain_(fromDomain)) {
    classification = 'linkedin_notice';
    // LinkedIn bodies are truncated; try to link by a company name appearing in
    // the subject/snippet. If none, record it but leave it unlinked.
    appRow = findCompanyMention_(apps, subject + ' ' + snippet);
    if (!appRow) {
      // Don't clutter with generic LinkedIn noise (e.g. "X viewed your profile").
      return false;
    }
  } else if (fromDomain && domainMap[fromDomain]) {
    // Clean domain match.
    appRow = domainMap[fromDomain];
    classification = classifyEmail_(cfg, appRow.company_name, subject, snippet);
  } else {
    // No domain match. Only bother Claude if a tracked company name is mentioned.
    var mentioned = findCompanyMention_(apps, subject + ' ' + snippet);
    if (!mentioned) return false; // irrelevant mail
    var guess = matchCompany_(cfg, subject, snippet, companies);
    if (!guess.company_id || guess.confidence < 0.6) {
      needsReview = true; // hard behavior #2: flag, never auto-apply
      classification = 'needs_review';
    } else {
      appRow = apps.filter(function (a) { return a.id === guess.company_id; })[0] || null;
      classification = guess.classification;
      if (!appRow) { needsReview = true; classification = 'needs_review'; }
    }
  }

  var summary;
  try {
    summary = summarizeThread_(cfg, threadText_(thread));
  } catch (e) {
    summary = '(summary unavailable)';
  }

  var eventRow = {
    user_id: userId,
    application_id: needsReview ? null : (appRow ? appRow.id : null),
    gmail_thread_id: threadId,
    last_message_at: lastDate.toISOString(),
    direction: 'in',
    classification: classification,
    summary: summary,
    raw_snippet: snippet.slice(0, 500),
    notified: false,
  };

  // Insert or update the event.
  if (existing.length) {
    sbPatch_(cfg, 'email_events', 'id=eq.' + existing[0].id, eventRow);
  } else {
    sbInsert_(cfg, 'email_events', eventRow);
  }

  // Advance the application + create a follow-up task when you owe a reply.
  if (appRow && !needsReview) {
    var newStage = stageForClassification_(classification, appRow.stage);
    var appPatch = { last_contact_at: lastDate.toISOString() };
    if (newStage !== appRow.stage) appPatch.stage = newStage;
    sbPatch_(cfg, 'applications', 'id=eq.' + appRow.id, appPatch);
    appRow.stage = newStage;

    if (classificationNeedsFollowUp_(classification)) {
      maybeCreateFollowUp_(cfg, appRow, classification);
    }
  }

  // Notify (once) for meaningful events.
  var meaningful = classification !== 'other';
  if (meaningful) {
    var who = appRow ? appRow.company_name : 'an unmatched sender';
    var subjectLine =
      '[Job CRM] ' + classification.replace('_', ' ') + ' — ' + who;
    var bodyLines = [
      'Classification: ' + classification,
      'Company: ' + (appRow ? appRow.company_name : '(needs review — could not match)'),
      'Email subject: ' + subject,
      '',
      'Summary: ' + summary,
      '',
      needsReview
        ? 'This email could not be confidently matched. Open the app to confirm which company it belongs to.'
        : 'Open the app to respond.',
      classification === 'linkedin_notice'
        ? '\nNote: LinkedIn notification bodies are usually truncated — read the full message in LinkedIn.'
        : '',
    ];
    notify_(cfg, subjectLine, bodyLines.join('\n'));
    // Mark notified.
    sbPatch_(
      cfg,
      'email_events',
      'user_id=eq.' + userId + '&gmail_thread_id=eq.' + encodeURIComponent(threadId),
      { notified: true }
    );
    // Log the notification (optional audit table).
    try {
      sbInsert_(cfg, 'notifications', {
        user_id: userId,
        application_id: needsReview ? null : (appRow ? appRow.id : null),
        type: 'event',
        message: subjectLine,
      });
    } catch (e) { /* notifications table is optional */ }
  }

  return true;
}

function findCompanyMention_(apps, haystack) {
  var lc = (haystack || '').toLowerCase();
  for (var i = 0; i < apps.length; i++) {
    var name = (apps[i].company_name || '').toLowerCase().trim();
    if (name && name.length >= 3 && lc.indexOf(name) >= 0) return apps[i];
  }
  return null;
}

function maybeCreateFollowUp_(cfg, appRow, classification) {
  var open = sbSelect_(
    cfg,
    'tasks',
    'select=id&application_id=eq.' + appRow.id +
      '&type=eq.follow_up&status=eq.open&limit=1'
  );
  if (open.length) return; // already have an open follow-up
  var title =
    classification === 'interview_invite'
      ? 'Respond to interview invite from ' + appRow.company_name
      : 'Reply to ' + appRow.company_name;
  var due = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  sbInsert_(cfg, 'tasks', {
    application_id: appRow.id,
    title: title,
    type: 'follow_up',
    due_at: due,
    status: 'open',
    notes: 'Auto-created by the email watcher.',
  });
}

// ====================== Sent-mail confirmation ==============================

function processSentConfirmations_(cfg, userId, apps) {
  var pending = sbSelect_(
    cfg,
    'applications',
    'select=id,company_name,email_domain,sent_confirmed&sent_confirmed=eq.false'
  );
  pending.forEach(function (a) {
    if (!a.email_domain) return;
    var q = 'in:sent newer_than:21d to:@' + String(a.email_domain).toLowerCase();
    var threads = GmailApp.search(q, 0, 3);
    if (!threads.length) return;
    var thread = threads[0];
    var last = thread.getMessages()[thread.getMessages().length - 1];

    sbPatch_(cfg, 'applications', 'id=eq.' + a.id, {
      sent_confirmed: true,
    });
    // Record an outgoing event so the conversation box shows your send.
    try {
      sbInsert_(cfg, 'email_events', {
        user_id: userId,
        application_id: a.id,
        gmail_thread_id: thread.getId(),
        last_message_at: last.getDate().toISOString(),
        direction: 'out',
        classification: 'other',
        summary: 'Your application/outreach email to ' + a.company_name + ' was found in Sent.',
        raw_snippet: (last.getPlainBody() || '').slice(0, 300),
        notified: true,
      }, { onConflict: 'user_id,gmail_thread_id', prefer: 'resolution=merge-duplicates' });
    } catch (e) { Logger.log('sent event insert: ' + e); }
  });
}

// ============================ Daily digest (8am) ===========================

function runDigest() {
  var cfg = CONFIG_();
  var userId = getUserId_(cfg);
  var nowIso = new Date().toISOString();
  var staleCutoff = new Date(Date.now() - cfg.STALE_DAYS * 86400000).toISOString();
  var soon = new Date(Date.now() + 3 * 86400000).toISOString();

  // Overdue + upcoming tasks (active = not done).
  var overdue = sbSelect_(
    cfg,
    'tasks',
    'select=title,due_at,application_id&status=in.(open,snoozed)&due_at=lt.' + nowIso + '&order=due_at.asc'
  );
  var upcoming = sbSelect_(
    cfg,
    'tasks',
    'select=title,due_at,application_id&status=in.(open,snoozed)&due_at=gte.' + nowIso +
      '&due_at=lte.' + soon + '&order=due_at.asc'
  );

  var apps = sbSelect_(
    cfg,
    'applications',
    'select=id,company_name,stage,last_contact_at,follow_up_due,created_at'
  );
  var appName = {};
  apps.forEach(function (a) { appName[a.id] = a.company_name; });

  // Gone quiet: still "in play" and no contact within STALE_DAYS. For apps with
  // no recorded contact yet, measure from when the application was created.
  var inPlay = ['applied', 'responded', 'screen', 'interview', 'final'];
  var quiet = apps.filter(function (a) {
    if (inPlay.indexOf(a.stage) < 0) return false;
    var clock = a.last_contact_at || a.created_at;
    return clock && clock < staleCutoff;
  });

  // Replies awaiting your response (recent inbound reply/interview events).
  var awaiting = sbSelect_(
    cfg,
    'email_events',
    'select=application_id,classification,summary,last_message_at&direction=eq.in' +
      '&classification=in.(reply,interview_invite)&order=last_message_at.desc&limit=25'
  );

  // Upcoming interviews (apps in interview/final stage).
  var interviews = apps.filter(function (a) {
    return a.stage === 'interview' || a.stage === 'final';
  });

  // Needs review.
  var review = sbSelect_(
    cfg,
    'email_events',
    'select=summary,last_message_at&classification=eq.needs_review&order=last_message_at.desc&limit=25'
  );

  var L = [];
  L.push('Daily job-search digest — ' + new Date().toDateString());
  L.push('');

  L.push('— OVERDUE TASKS (' + overdue.length + ') —');
  overdue.forEach(function (t) {
    L.push('  • ' + t.title + '  [' + (appName[t.application_id] || '?') + ']  was due ' + fmt_(t.due_at));
  });
  if (!overdue.length) L.push('  (none — nice)');
  L.push('');

  L.push('— REPLIES AWAITING YOU (' + awaiting.length + ') —');
  awaiting.forEach(function (e) {
    L.push('  • ' + (appName[e.application_id] || '?') + ': ' + (e.summary || e.classification));
  });
  if (!awaiting.length) L.push('  (none)');
  L.push('');

  L.push('— UPCOMING INTERVIEWS (' + interviews.length + ') —');
  interviews.forEach(function (a) { L.push('  • ' + a.company_name + ' (' + a.stage + ')'); });
  if (!interviews.length) L.push('  (none)');
  L.push('');

  L.push('— GONE QUIET > ' + cfg.STALE_DAYS + ' days (' + quiet.length + ') —');
  quiet.forEach(function (a) {
    L.push('  • ' + a.company_name + '  (last contact ' + (a.last_contact_at ? fmt_(a.last_contact_at) : 'never') + ')');
  });
  if (!quiet.length) L.push('  (none)');
  L.push('');

  L.push('— UPCOMING TASKS (next 3 days) (' + upcoming.length + ') —');
  upcoming.forEach(function (t) {
    L.push('  • ' + t.title + '  [' + (appName[t.application_id] || '?') + ']  due ' + fmt_(t.due_at));
  });
  if (!upcoming.length) L.push('  (none)');
  L.push('');

  L.push('— NEEDS REVIEW (' + review.length + ') —');
  review.forEach(function (e) { L.push('  • ' + (e.summary || '(email)') + '  ' + fmt_(e.last_message_at)); });
  if (!review.length) L.push('  (none)');

  notify_(cfg, '[Job CRM] Daily digest — ' + overdue.length + ' overdue, ' + awaiting.length + ' awaiting you', L.join('\n'));
  try {
    sbInsert_(cfg, 'notifications', { user_id: userId, type: 'digest', message: 'Daily digest sent' });
  } catch (e) { /* optional */ }
  Logger.log('Digest sent.');
}

function fmt_(iso) {
  if (!iso) return '—';
  return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'MMM d, h:mm a');
}

// ============================ Triggers / setup ==============================

function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('runWatcher').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('runDigest').timeBased().atHour(8).everyDays(1).create();
  Logger.log('Installed: runWatcher (every 15 min) + runDigest (daily 8am).');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'runWatcher' || fn === 'runDigest') ScriptApp.deleteTrigger(t);
  });
}

// Run manually to verify credentials + connectivity before installing triggers.
function testConnection() {
  var cfg = CONFIG_();
  var userId = getUserId_(cfg);
  Logger.log('USER_ID: ' + userId);
  var apps = sbSelect_(cfg, 'applications', 'select=id,company_name&limit=5');
  Logger.log('Supabase OK — ' + apps.length + ' application(s) visible.');
  var hello = claudeText_(cfg, 'Reply with the single word: ok', 'ping', 10);
  Logger.log('Anthropic OK — model said: ' + hello);
  Logger.log('NOTIFY_EMAIL: ' + cfg.NOTIFY_EMAIL + ' (sending a test email)');
  notify_(cfg, '[Job CRM] test email', 'If you got this, GmailApp send works.');
  Logger.log('All good. You can run installTriggers now.');
}
