/* =========================================================
   SpeakOut — One minute. Your voice.
   Local pass-and-play English speaking game. Vanilla JS.

   Structure
     1. Constants & topic bank
     2. Small helpers
     3. Application state
     4. Setup screen (players, rounds, categories, validation)
     5. Game flow (turns, rounds, scoring)
     6. Timer (timestamp based)
     7. Rendering (handoff, topic, timer, leaderboard, results)
     8. Dialogs, toasts, errors
     9. Event wiring & start-up
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     1. CONSTANTS & TOPIC BANK
     --------------------------------------------------------- */
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 30;
  const MIN_ROUNDS = 1;
  const MAX_ROUNDS = 30;
  const MAX_NAME_LEN = 24;
  const MAX_TOPIC_LEN = 500;

  const TURN_MS = 60000;   // a full speaking turn
  const HALF_MS = 30000;   // threshold for half a point
  const RING_C = 2 * Math.PI * 120; // circumference of the progress ring (r = 120)

  const CATEGORIES = [
    { id: 'mixed',    label: 'Mixed topics' },
    { id: 'everyday', label: 'Everyday life' },
    { id: 'college',  label: 'College life' },
    { id: 'tech',     label: 'Technology' },
    { id: 'people',   label: 'People and values' },
    { id: 'nature',   label: 'Nature and environment' },
    { id: 'creative', label: 'Creative and abstract topics' }
  ];

  const TOPICS = {
    everyday: [
      'Coffee', 'Breakfast', 'Rain', 'Music', 'Travel', 'Friendship', 'Family', 'Cooking',
      'Shopping', 'Sleep', 'Exercise', 'Money', 'Holidays', 'Books', 'Movies', 'Clothing',
      'Hobbies', 'Pets', 'Bicycles', 'Buses', 'Trains', 'Markets', 'Gardens', 'Phones',
      'Food', 'Celebrations', 'Neighbours', 'Time', 'Habits', 'Home'
    ],
    college: [
      'Exams', 'Teachers', 'Lectures', 'Laboratories', 'Projects', 'Internships', 'Hostels',
      'Canteens', 'Libraries', 'Attendance', 'Assignments', 'Deadlines', 'Teamwork',
      'Leadership', 'Graduation', 'Scholarships', 'Clubs', 'Festivals', 'Sports', 'Notes',
      'Presentations', 'Seminars', 'Experiments', 'Engineering', 'Careers', 'Friendship',
      'Motivation', 'Creativity', 'Research', 'Learning'
    ],
    tech: [
      'Robots', 'Smartphones', 'Computers', 'Internet', 'Artificial-intelligence', 'Coding',
      'Gaming', 'Satellites', 'Drones', 'Sensors', 'Circuits', 'Batteries', 'Electricity',
      'Software', 'Hardware', 'Security', 'Privacy', 'Passwords', 'Automation', 'Virtual-reality',
      'Printers', 'Cameras', 'Microphones', 'Speakers', 'Television', 'Radio', 'Spacecraft',
      'Navigation', 'Innovation', 'Technology'
    ],
    people: [
      'Honesty', 'Kindness', 'Respect', 'Courage', 'Patience', 'Trust', 'Empathy', 'Confidence',
      'Success', 'Failure', 'Forgiveness', 'Generosity', 'Fairness', 'Teamwork', 'Friendship',
      'Family', 'Community', 'Culture', 'Tradition', 'Leadership', 'Ambition', 'Discipline',
      'Gratitude', 'Responsibility', 'Loyalty', 'Wisdom', 'Humour', 'Hope', 'Freedom', 'Peace'
    ],
    nature: [
      'Forests', 'Oceans', 'Rivers', 'Mountains', 'Rain', 'Thunder', 'Lightning', 'Sunshine',
      'Clouds', 'Wind', 'Flowers', 'Trees', 'Bees', 'Butterflies', 'Birds', 'Elephants',
      'Tigers', 'Coral', 'Deserts', 'Islands', 'Waterfalls', 'Gardens', 'Recycling', 'Pollution',
      'Climate', 'Seasons', 'Sunsets', 'Moonlight', 'Stars', 'Wildlife'
    ],
    creative: [
      'Dreams', 'Magic', 'Mystery', 'Time-travel', 'Dragons', 'Superpowers', 'Aliens', 'Castles',
      'Inventions', 'Imagination', 'Memories', 'Silence', 'Colours', 'Mirrors', 'Shadows',
      'Adventure', 'Treasure', 'Secrets', 'Gravity', 'Future', 'Past', 'Fantasy', 'Comics',
      'Animation', 'Storytelling', 'Islands', 'Moon', 'Portals', 'Robots', 'Wonder'
    ]
  };

  /* ---------------------------------------------------------
     2. SMALL HELPERS
     --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let idCounter = 0;
  const uid = () => `p${++idCounter}`;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const now = () => performance.now(); // monotonic clock, unaffected by system clock changes

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Normalise a name: trim and collapse repeated spaces. */
  const normaliseName = (s) => String(s || '').trim().replace(/\s+/g, ' ');

  const fmtPoints = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const pointsLabel = (n) => `${fmtPoints(n)} ${n === 1 ? 'point' : 'points'}`;
  /** Seconds with one decimal, floored so 59.99s never displays as 60.0s. */
  const fmtSeconds = (ms) => `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;

  function joinNames(names) {
    if (names.length <= 1) return names[0] || '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  /** Remaining time as MM:SS. Rounds up so 00:00 is shown only at exactly zero. */
  function formatClock(elapsedMs) {
    const remainingMs = clamp(TURN_MS - elapsedMs, 0, TURN_MS);
    const secs = Math.ceil(remainingMs / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /** The scoring rules, in one place. */
  function scoreFor(ms) {
    if (ms >= TURN_MS) return 1;
    if (ms >= HALF_MS) return 0.5;
    return 0;
  }

  function reasonFor(ms) {
    if (ms >= TURN_MS) return 'The full 60 seconds were completed.';
    if (ms >= HALF_MS) return 'At least 30 seconds but under 60: half a point.';
    return 'Under 30 seconds, so no points this turn.';
  }

  /* ---------------------------------------------------------
     3. APPLICATION STATE
     --------------------------------------------------------- */

  // Setup form model (survives "New Game" so players don't retype everything)
  const setup = {
    players: [{ id: uid(), name: '' }, { id: uid(), name: '' }],
    roundsText: '3',
    category: 'mixed',
    custom: ''
  };

  let game = null;       // active game, or null
  let phase = 'setup';   // setup | handoff | topic | timer | results | error

  /** Which screen transitions are legal. Anything else is ignored. */
  const ALLOWED = {
    setup:   ['handoff'],
    handoff: ['topic', 'setup'],
    topic:   ['timer', 'setup'],
    timer:   ['topic', 'handoff', 'results', 'setup'],
    results: ['handoff', 'setup'],
    error:   ['setup']
  };

  function transition(to) {
    if (to !== phase && to !== 'error' && !(ALLOWED[phase] || []).includes(to)) {
      console.warn(`Blocked invalid transition: ${phase} -> ${to}`);
      return false;
    }
    phase = to;
    render(true);
    return true;
  }

  /* ---------------------------------------------------------
     4. SETUP SCREEN
     --------------------------------------------------------- */
  function renderCategories() {
    const group = $('#categoryGroup');
    group.textContent = '';
    CATEGORIES.forEach((cat) => {
      const label = el('label', 'chip');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = cat.id;
      input.checked = setup.category === cat.id;
      label.append(input, el('span', '', cat.label));
      group.append(label);
    });
  }

  function renderPlayers(focusId) {
    const list = $('#playerList');
    list.textContent = '';
    setup.players.forEach((p, i) => {
      const li = el('li', 'player-row');
      li.dataset.id = p.id;

      const num = el('span', 'player-num', String(i + 1));
      num.setAttribute('aria-hidden', 'true');

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'player-input';
      input.value = p.name;
      input.maxLength = MAX_NAME_LEN;
      input.placeholder = `Player ${i + 1}`;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', `Player ${i + 1} name`);
      input.dataset.id = p.id;

      const remove = el('button', 'btn btn-ghost icon-btn', '✕');
      remove.type = 'button';
      remove.dataset.action = 'remove-player';
      remove.dataset.id = p.id;
      remove.setAttribute('aria-label', `Remove player ${i + 1}`);
      remove.disabled = setup.players.length <= MIN_PLAYERS;

      li.append(num, input, remove);
      list.append(li);
    });

    $('#playerCount').textContent = `${setup.players.length} of ${MAX_PLAYERS}`;
    $('#addPlayerBtn').disabled = setup.players.length >= MAX_PLAYERS;

    if (focusId) {
      const target = list.querySelector(`input[data-id="${focusId}"]`);
      if (target) target.focus();
    }
    renderSummary();
  }

  function parseRounds() {
    const text = String(setup.roundsText).trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= MIN_ROUNDS && n <= MAX_ROUNDS ? n : null;
  }

  function renderSummary() {
    const rounds = parseRounds();
    const n = setup.players.length;
    const box = $('#setupSummary');
    if (rounds === null) {
      box.textContent = `Choose a number of rounds from ${MIN_ROUNDS} to ${MAX_ROUNDS}.`;
      return;
    }
    const turns = n * rounds;
    box.textContent = '';
    const strong = el('strong', '', `${turns} ${turns === 1 ? 'turn' : 'turns'}`);
    box.append(
      `${n} players × ${rounds} ${rounds === 1 ? 'round' : 'rounds'} = `,
      strong,
      `. Allow roughly ${turns} to ${turns * 2} minutes including handoffs.`
    );
  }

  function clearSetupErrors() {
    $('#setupErrors').hidden = true;
    $('#setupErrorList').textContent = '';
    document.querySelectorAll('#screen-setup [aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  }

  function showSetupErrors(errors, badPlayerIds) {
    clearSetupErrors();
    const list = $('#setupErrorList');
    errors.forEach((msg) => list.append(el('li', '', msg)));
    badPlayerIds.forEach((id) => {
      const input = $(`#playerList input[data-id="${id}"]`);
      if (input) input.setAttribute('aria-invalid', 'true');
    });
    if (errors.some((e) => e.startsWith('Rounds'))) $('#roundsInput').setAttribute('aria-invalid', 'true');
    if (errors.some((e) => e.startsWith('Custom words') || e.startsWith('Each custom') || e.startsWith('Remove duplicate') || e.startsWith('Enter at least'))) $('#customTopic').setAttribute('aria-invalid', 'true');
    const box = $('#setupErrors');
    box.hidden = false;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.focus({ preventScroll: true });
  }

  /**
   * Validate the whole form. Returns { ok, errors, badIds, config }.
   * config contains the final player list (with defaults filled in).
   */
  function validateSetup() {
    const errors = [];
    const badIds = new Set();

    // Player count
    if (setup.players.length < MIN_PLAYERS || setup.players.length > MAX_PLAYERS) {
      errors.push(`You need between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
    }

    // Duplicate names (trimmed, case-insensitive). Blank names are skipped.
    const seen = new Map();
    const reported = new Set();
    setup.players.forEach((p) => {
      const name = normaliseName(p.name);
      if (!name) return;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) {
        badIds.add(p.id);
        badIds.add(seen.get(key).id);
        if (!reported.has(key)) {
          reported.add(key);
          errors.push(`“${seen.get(key).name}” is used more than once. Give each player a different name.`);
        }
      } else {
        seen.set(key, { id: p.id, name });
      }
    });

    // Rounds
    const rounds = parseRounds();
    if (rounds === null) errors.push(`Rounds must be a whole number from ${MIN_ROUNDS} to ${MAX_ROUNDS}.`);

    // Category
    if (!CATEGORIES.some((c) => c.id === setup.category)) errors.push('Pick a topic category.');

    // Custom topic
    const customText = String(setup.custom || '').trim();
    const customWords = customText
      ? customText.split(',').map((word) => word.trim()).filter(Boolean)
      : [];
    if (customText.length > MAX_TOPIC_LEN) {
      errors.push(`Custom words must be ${MAX_TOPIC_LEN} characters or fewer.`);
    }
    if (customWords.some((word) => /\s/.test(word))) {
      errors.push('Each custom entry must be a single word. Separate words with commas.');
    }
    const uniqueCustomWords = [...new Set(customWords.map((word) => word.toLocaleLowerCase()))];
    if (customWords.length !== uniqueCustomWords.length) {
      errors.push('Remove duplicate words from the custom word list.');
    }
    if (customWords.length > 0 && customWords.length < setup.players.length) {
      errors.push(`Enter at least ${setup.players.length} different custom words so every player gets a different word in each round.`);
    }
    const custom = customWords;

    if (errors.length) return { ok: false, errors, badIds: [...badIds] };

    // Fill defaults for blank names, avoiding collisions with typed names
    const taken = new Set(setup.players.map((p) => normaliseName(p.name).toLocaleLowerCase()).filter(Boolean));
    const players = setup.players.map((p, i) => {
      let name = normaliseName(p.name);
      if (!name) {
        let k = i + 1;
        while (taken.has(`player ${k}`)) k++;
        name = `Player ${k}`;
        taken.add(name.toLocaleLowerCase());
      }
      return { id: p.id, name };
    });

    return { ok: true, errors: [], badIds: [], config: { players, rounds, category: setup.category, customWords: custom } };
  }

  function addPlayer() {
    if (setup.players.length >= MAX_PLAYERS) return;
    const p = { id: uid(), name: '' };
    setup.players.push(p);
    clearSetupErrors();
    renderPlayers(p.id);
    const list = $('#playerList');
    list.scrollTop = list.scrollHeight;
  }

  function removePlayer(id) {
    if (setup.players.length <= MIN_PLAYERS) return;
    const idx = setup.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    setup.players.splice(idx, 1);
    clearSetupErrors();
    const next = setup.players[Math.min(idx, setup.players.length - 1)];
    renderPlayers(next && next.id);
  }

  function stepRounds(delta) {
    const current = parseRounds() ?? clamp(parseInt(setup.roundsText, 10) || MIN_ROUNDS, MIN_ROUNDS, MAX_ROUNDS);
    const next = clamp(current + delta, MIN_ROUNDS, MAX_ROUNDS);
    setup.roundsText = String(next);
    $('#roundsInput').value = setup.roundsText;
    clearSetupErrors();
    renderSummary();
  }

  /* ---------------------------------------------------------
     5. GAME FLOW
     --------------------------------------------------------- */

  /**
   * Deal a different single-word topic to each player in every round.
   * A round never contains duplicate words. Words are shuffled and reused
   * only after the selected pool has been exhausted.
   */
  function buildRoundTopics(category, customWords, rounds, playerCount) {
    const pool = customWords.length
      ? customWords.slice()
      : (category === 'mixed'
          ? Object.values(TOPICS).flat()
          : TOPICS[category].slice());

    if (pool.length < playerCount) {
      throw new Error('There are not enough unique words for all players.');
    }

    const result = [];
    let deck = [];

    for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
      const wordsForRound = [];

      while (wordsForRound.length < playerCount) {
        if (deck.length === 0) {
          deck = shuffle(pool);
        }
        const nextWord = deck.pop();
        if (!wordsForRound.includes(nextWord)) {
          wordsForRound.push(nextWord);
        }
      }

      result.push(wordsForRound);
    }

    return result;
  }

  function createGame(config) {
    return {
      config,                              // kept so "Play Again" can reuse it
      players: config.players.map((p) => ({ ...p })),
      rounds: config.rounds,
      roundTopics: buildRoundTopics(config.category, config.customWords || [], config.rounds, config.players.length),
      round: 1,                            // 1-based
      playerIndex: 0,
      topic: '',
      topicRevealed: false,
      topicSeen: false,
      timer: { status: 'ready', startedAt: 0, elapsedMs: 0, handle: null },
      history: [],                         // one entry per scored turn
      scores: {},                          // playerId -> total points (cache of history)
      saving: false
    };
  }

  const totalTurns = (g) => g.players.length * g.rounds;

  /** Prepare state for the current player's turn. */
  function beginTurn() {
    const g = game;
    stopTimerHandle();
    g.topic = g.roundTopics[g.round - 1][g.playerIndex];
    g.topicRevealed = false;
    g.topicSeen = false;
    g.timer = { status: 'ready', startedAt: 0, elapsedMs: 0, handle: null };
    g.saving = false;
  }

  function startGame() {
    const result = validateSetup();
    if (!result.ok) {
      showSetupErrors(result.errors, result.badIds);
      return;
    }
    clearSetupErrors();
    game = createGame(result.config);
    recomputeScores();
    beginTurn();
    transition('handoff');
  }

  function recomputeScores() {
    const g = game;
    g.scores = {};
    g.players.forEach((p) => { g.scores[p.id] = 0; });
    g.history.forEach((h) => { g.scores[h.playerId] += h.points; });
  }

  function currentPlayer() {
    return game.players[game.playerIndex];
  }

  /** Rankings: points desc, ties keep registration order; ties share a rank (1, 1, 3). */
  function getRankings() {
    const g = game;
    const rows = g.players.map((player, order) => {
      const turns = g.history.filter((h) => h.playerId === player.id);
      return {
        player,
        order,
        points: turns.reduce((sum, h) => sum + h.points, 0),
        turns: turns.length,
        ms: turns.reduce((sum, h) => sum + h.durationMs, 0)
      };
    });
    rows.sort((a, b) => b.points - a.points || a.order - b.order);
    let rank = 0;
    rows.forEach((r, i) => {
      if (i === 0 || r.points !== rows[i - 1].points) rank = i + 1;
      r.rank = rank;
    });
    return rows;
  }

  /**
   * Save the current turn. Guarded three ways so a turn can never score twice:
   * phase check, `saving` lock, and a lookup in history for round + player.
   */
  function saveTurn() {
    const g = game;
    if (!g || phase !== 'timer' || g.saving) return;
    const t = g.timer;
    if (t.status !== 'stopped' && t.status !== 'timeup') return;

    const player = currentPlayer();
    if (g.history.some((h) => h.round === g.round && h.playerId === player.id)) return;

    g.saving = true;
    const ms = t.status === 'timeup' ? TURN_MS : clamp(Math.floor(t.elapsedMs), 0, TURN_MS);
    const points = scoreFor(ms);

    g.history.push({
      round: g.round,
      playerId: player.id,
      player: player.name,
      topic: g.topic,
      durationMs: ms,
      points
    });
    recomputeScores();
    showToast(`${player.name} scored ${pointsLabel(points)}`);

    // Advance: next player, next round, or finish
    if (g.playerIndex + 1 < g.players.length) {
      g.playerIndex += 1;
    } else if (g.round < g.rounds) {
      g.round += 1;
      g.playerIndex = 0;
    } else {
      stopTimerHandle();
      g.saving = false;
      transition('results');
      return;
    }
    beginTurn();
    transition('handoff');
  }

  async function quitGame() {
    const g = game;
    const ok = await askConfirm({
      title: 'Quit this game?',
      body: 'Scores and progress will be lost.',
      confirmLabel: 'Quit game',
      danger: true
    });
    if (!ok || game !== g || !game) return;
    stopTimerHandle();
    game = null;
    transition('setup');
  }

  function playAgain() {
    if (!game) return;
    // Same players and settings, completely fresh scores, history and topics
    game = createGame(game.config);
    recomputeScores();
    beginTurn();
    transition('handoff');
  }

  function newGame() {
    stopTimerHandle();
    game = null;
    transition('setup');
  }

  /* ---- topic reveal actions ---- */
  function takeDevice() {
    if (phase !== 'handoff') return;
    transition('topic');
  }

  function revealTopic() {
    if (phase !== 'topic' || game.topicRevealed) return;
    game.topicRevealed = true;
    game.topicSeen = true;
    renderTopic();
    $('#hideBtn').focus();
  }

  function hideTopic() {
    if (phase !== 'topic' || !game.topicRevealed) return;
    game.topicRevealed = false;
    renderTopic();
    $('#readyBtn').focus();
  }

  function readyToSpeak() {
    if (phase !== 'topic' || !game.topicSeen || game.topicRevealed) return;
    transition('timer');
  }

  function backToTopic() {
    // Only before the clock starts; never mid-turn
    if (phase !== 'timer' || game.timer.status !== 'ready') return;
    game.topicRevealed = false;
    transition('topic');
  }

  /* ---------------------------------------------------------
     6. TIMER (timestamp based)
     The elapsed time is always computed as now - startedAt, so
     throttled intervals or background tabs can't make it drift.
     --------------------------------------------------------- */
  function currentElapsed() {
    const t = game.timer;
    if (t.status === 'speaking') return clamp(now() - t.startedAt, 0, TURN_MS);
    return clamp(t.elapsedMs, 0, TURN_MS);
  }

  function stopTimerHandle() {
    if (game && game.timer && game.timer.handle) {
      clearInterval(game.timer.handle);
      game.timer.handle = null;
    }
  }

  function startTimer() {
    const g = game;
    if (!g || phase !== 'timer' || g.timer.status !== 'ready') return; // blocks duplicate starts
    const t = g.timer;
    t.status = 'speaking';
    t.startedAt = now();
    t.elapsedMs = 0;
    stopTimerHandle();
    t.handle = setInterval(tick, 50);
    renderTimer();
    announce('Timer started.');
    $('#stopTimerBtn').focus();
  }

  function tick() {
    const g = game;
    if (!g || g.timer.status !== 'speaking') return;
    if (now() - g.timer.startedAt >= TURN_MS) finishTimer(true);
    else renderTimer();
  }

  /** End the run. `timeUp` = true when the countdown reached zero by itself. */
  function finishTimer(timeUp) {
    const g = game;
    if (!g || g.timer.status !== 'speaking') return; // blocks duplicate finishes
    const t = g.timer;
    stopTimerHandle();
    const elapsed = timeUp ? TURN_MS : clamp(Math.floor(now() - t.startedAt), 0, TURN_MS);
    if (elapsed >= TURN_MS) {
      t.status = 'timeup';
      t.elapsedMs = TURN_MS; // a completed turn records exactly 60 seconds
    } else {
      t.status = 'stopped';
      t.elapsedMs = elapsed;
    }
    renderTimer();
    announce(t.status === 'timeup' ? 'Time is up.' : 'Timer stopped.');
    $('#saveBtn').focus();
  }

  async function resetTimer() {
    const g = game;
    if (!g || phase !== 'timer') return;
    const status = g.timer.status;
    if (status !== 'stopped' && status !== 'timeup') return;
    const key = `${g.round}:${g.playerIndex}`;
    const ok = await askConfirm({
      title: 'Reset the timer?',
      body: 'This attempt will be discarded and the player starts again from 60 seconds.',
      confirmLabel: 'Reset timer',
      danger: true
    });
    // The world may have changed while the dialog was open
    if (!ok || game !== g || phase !== 'timer' || key !== `${g.round}:${g.playerIndex}`) return;
    if (g.timer.status !== 'stopped' && g.timer.status !== 'timeup') return;
    stopTimerHandle();
    g.timer = { status: 'ready', startedAt: 0, elapsedMs: 0, handle: null };
    renderTimer();
    announce('Timer reset.');
    $('#startTimerBtn').focus();
  }

  /* ---------------------------------------------------------
     7. RENDERING
     --------------------------------------------------------- */
  const SCREENS = { setup: '#screen-setup', results: '#screen-results', error: '#screen-error' };
  const STAGES = { handoff: '#stage-handoff', topic: '#stage-topic', timer: '#stage-timer' };
  const FOCUS_TARGET = {
    setup: '#setupTitle', handoff: '#handoffTitle', topic: '#topicTitle',
    timer: '#timerTitle', results: '#resultsTitle', error: '#errorTitle'
  };

  /** Show the right screen. `moveFocus` is true on real screen changes. */
  function render(moveFocus) {
    const inGame = phase === 'handoff' || phase === 'topic' || phase === 'timer';

    Object.entries(SCREENS).forEach(([name, sel]) => { $(sel).hidden = phase !== name; });
    $('#gameShell').hidden = !inGame;
    Object.entries(STAGES).forEach(([name, sel]) => { $(sel).hidden = phase !== name; });
    document.body.dataset.phase = phase;

    if (phase === 'setup') {
      renderCategories();
      renderPlayers();
      $('#roundsInput').value = setup.roundsText;
      $('#customTopic').value = setup.custom;
      clearSetupErrors();
    }

    if (inGame) {
      renderGameBar();
      renderBoard();
      if (phase === 'handoff') renderHandoff();
      if (phase === 'topic') renderTopic();
      if (phase === 'timer') renderTimerShell();
    }

    if (phase === 'results') renderResults();

    if (moveFocus) {
      window.scrollTo({ top: 0 });
      const target = $(FOCUS_TARGET[phase]);
      if (target) target.focus({ preventScroll: true });
    }
  }

  function roundLabel() {
    return `Round ${game.round} of ${game.rounds}`;
  }

  function renderGameBar() {
    const g = game;
    const done = g.history.length;
    const total = totalTurns(g);
    $('#gbRound').textContent = roundLabel();
    $('#gbTurn').textContent = `Turn ${Math.min(done + 1, total)} of ${total}`;
    const pct = Math.round((done / total) * 100);
    $('#gbProgressFill').style.width = `${pct}%`;
    $('#gbProgress').setAttribute('aria-valuenow', String(pct));
    $('#gbProgress').setAttribute('aria-valuetext', `${done} of ${total} turns completed`);
  }

  function renderBoard() {
    const g = game;
    const list = $('#boardList');
    list.textContent = '';
    const current = phase === 'results' ? null : currentPlayer().id;
    getRankings().forEach((row) => {
      const li = el('li', 'board-row');
      li.dataset.rank = String(row.rank);
      if (row.player.id === current) {
        li.classList.add('is-current');
        li.setAttribute('aria-current', 'true');
      }
      const bar = el('div', 'mini-bar');
      const fill = el('span');
      fill.style.width = `${clamp((row.points / g.rounds) * 100, 0, 100)}%`;
      bar.append(fill);
      li.append(
        el('span', 'board-rank', String(row.rank)),
        el('span', 'board-name', row.player.name),
        el('span', 'board-points', fmtPoints(row.points)),
        bar
      );
      list.append(li);
    });
  }

  function renderHandoff() {
    const p = currentPlayer();
    $('#handoffRound').textContent = roundLabel();
    $('#handoffTitle').textContent = `${p.name}’s turn`;
    $('#handoffName').textContent = p.name;
    $('#takeBtn').textContent = `I’m ${p.name}. Continue`;
  }

  function renderTopic() {
    const g = game;
    const p = currentPlayer();
    $('#topicRound').textContent = `${roundLabel()}`;
    $('#topicTitle').textContent = `${p.name}, here is your word`;

    const card = $('#topicCard');
    const text = $('#topicText');
    card.dataset.revealed = String(g.topicRevealed);
    // The word only exists in the DOM while it is deliberately revealed
    if (g.topicRevealed) {
      text.textContent = g.topic;
      text.hidden = false;
      $('#topicHidden').hidden = true;
    } else {
      text.textContent = '';
      text.hidden = true;
      $('#topicHidden').hidden = false;
    }

    $('#revealBtn').disabled = g.topicRevealed;
    $('#hideBtn').disabled = !g.topicRevealed;
    $('#readyBtn').disabled = !(g.topicSeen && !g.topicRevealed);

    let hint = 'Reveal your word. Make sure nobody else can see the screen.';
    if (g.topicRevealed) hint = 'Hide the word before you hand the device to the timer operator.';
    else if (g.topicSeen) hint = 'Word hidden. Hand the device to whoever runs the timer, then press Ready.';
    $('#topicHint').textContent = hint;
  }

  /** Static parts of the timer screen (names, labels). */
  function renderTimerShell() {
    const p = currentPlayer();
    $('#timerRound').textContent = roundLabel();
    $('#timerTitle').textContent = `${p.name}’s turn to speak`;
    renderTimer();
  }

  /** Dynamic parts of the timer screen. Safe to call on every tick. */
  function renderTimer() {
    if (!game || phase !== 'timer') return;
    const t = game.timer;
    const status = t.status;
    const elapsed = currentElapsed();

    $('#timeText').textContent = formatClock(elapsed);

    // Ring depletes as time passes
    const fg = $('#ringFg');
    fg.style.strokeDasharray = RING_C.toFixed(2);
    fg.style.strokeDashoffset = (RING_C * (elapsed / TURN_MS)).toFixed(2);
    fg.style.visibility = elapsed >= TURN_MS ? 'hidden' : 'visible'; // no stray round-cap dot at zero

    const timerEl = $('#timer');
    timerEl.dataset.state = status;
    timerEl.dataset.half = String(elapsed >= HALF_MS);

    const labels = { ready: 'Ready', speaking: 'Speaking', stopped: 'Stopped', timeup: 'Time’s up' };
    $('#stateText').textContent = labels[status];

    $('#legendHalf').classList.toggle('hit', elapsed >= HALF_MS);
    $('#legendFull').classList.toggle('hit', elapsed >= TURN_MS);

    // Only controls that make sense in the current state are enabled
    $('#startTimerBtn').disabled = status !== 'ready';
    $('#stopTimerBtn').disabled = status !== 'speaking';
    $('#resetTimerBtn').disabled = !(status === 'stopped' || status === 'timeup');
    $('#peekBtn').hidden = status !== 'ready';

    // Score review (the confirmation step)
    const review = $('#review');
    const finished = status === 'stopped' || status === 'timeup';
    review.hidden = !finished;
    if (finished) {
      const ms = status === 'timeup' ? TURN_MS : Math.floor(t.elapsedMs);
      const pts = scoreFor(ms);
      const name = currentPlayer().name;
      $('#reviewTitle').textContent = status === 'timeup'
        ? `${name} spoke the full minute`
        : `${name} spoke for ${fmtSeconds(ms)}`;
      $('#reviewPoints').textContent = pointsLabel(pts);
      $('#reviewReason').textContent = reasonFor(ms);
      $('#saveBtn').disabled = game.saving;
    }
  }

  function renderResults() {
    const g = game;
    const rows = getRankings();
    const top = rows[0].points;
    const winners = rows.filter((r) => r.points === top).map((r) => r.player.name);

    if (winners.length === 1) {
      $('#winnerLine').textContent = `${winners[0]} wins!`;
      $('#winnerSub').textContent = `Finished first with ${pointsLabel(top)}.`;
    } else if (winners.length === g.players.length) {
      $('#winnerLine').textContent = 'Everyone ties!';
      $('#winnerSub').textContent = `All ${winners.length} players finished with ${pointsLabel(top)}.`;
    } else {
      $('#winnerLine').textContent = 'It’s a tie!';
      $('#winnerSub').textContent = `${joinNames(winners)} share first place with ${pointsLabel(top)}.`;
    }

    $('#turnsDone').textContent = `${g.history.length} of ${totalTurns(g)} turns completed`;

    const list = $('#rankList');
    list.textContent = '';
    rows.forEach((r) => {
      const li = el('li', 'rank-row');
      li.dataset.rank = String(r.rank);
      const pts = el('span', 'rank-points', fmtPoints(r.points));
      pts.append(el('small', '', r.points === 1 ? 'point' : 'points'));
      li.append(
        el('span', 'rank-pos', String(r.rank)),
        el('span', 'rank-name', r.player.name),
        el('span', 'rank-meta', `${r.turns} ${r.turns === 1 ? 'turn' : 'turns'} · ${fmtSeconds(r.ms)} spoken`),
        pts
      );
      list.append(li);
    });

    const body = $('#historyBody');
    body.textContent = '';
    g.history.forEach((h) => {
      const tr = document.createElement('tr');
      [String(h.round), h.player, h.topic, fmtSeconds(h.durationMs), fmtPoints(h.points)].forEach((cell) => {
        tr.append(el('td', '', cell));
      });
      body.append(tr);
    });
  }

  /* ---------------------------------------------------------
     8. DIALOGS, TOASTS, ERRORS
     --------------------------------------------------------- */
  let dialogResolver = null;
  let toastTimer = null;

  function askConfirm({ title, body, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      if (dialogResolver) closeDialog(false); // never stack dialogs
      dialogResolver = resolve;
      const dlg = $('#confirmDialog');
      $('#dialogTitle').textContent = title;
      $('#dialogBody').textContent = body;
      const ok = $('#dialogOk');
      ok.textContent = confirmLabel;
      ok.classList.toggle('btn-danger', danger);
      ok.classList.toggle('btn-primary', !danger);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      $('#dialogCancel').focus();
    });
  }

  function closeDialog(result) {
    const resolve = dialogResolver;
    dialogResolver = null;
    const dlg = $('#confirmDialog');
    if (dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
    if (resolve) resolve(result);
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
    announce(message);
  }

  function announce(message) {
    const live = $('#live');
    live.textContent = '';
    // Re-set on the next frame so screen readers notice repeated messages
    setTimeout(() => { live.textContent = message; }, 30);
  }

  /** Friendly fallback for anything unexpected. Technical detail goes to the console only. */
  function showFatal(err) {
    try {
      console.error('SpeakOut error:', err);
      stopTimerHandle();
      if (dialogResolver) closeDialog(false);
      game = null;
      phase = 'error';
      render(true);
    } catch (inner) {
      document.body.textContent = 'Something went wrong. Please reload the page.';
    }
  }

  function resetAfterError() {
    game = null;
    phase = 'setup';
    render(true);
  }

  /* ---------------------------------------------------------
     9. EVENT WIRING & START-UP
     One delegated listener per event type, registered once,
     so handlers can never be duplicated.
     --------------------------------------------------------- */
  const ACTIONS = {
    'add-player':    () => addPlayer(),
    'remove-player': (btn) => removePlayer(btn.dataset.id),
    'rounds-dec':    () => stepRounds(-1),
    'rounds-inc':    () => stepRounds(1),
    'take-device':   takeDevice,
    'reveal':        revealTopic,
    'hide':          hideTopic,
    'ready':         readyToSpeak,
    'back-to-topic': backToTopic,
    'timer-start':   startTimer,
    'timer-stop':    () => finishTimer(false),
    'timer-reset':   resetTimer,
    'save-score':    saveTurn,
    'quit':          quitGame,
    'play-again':    playAgain,
    'new-game':      newGame,
    'error-reset':   resetAfterError,
    'error-reload':  () => window.location.reload(),
    'dialog-ok':     () => closeDialog(true),
    'dialog-cancel': () => closeDialog(false)
  };

  function wireEvents() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const handler = ACTIONS[btn.dataset.action];
      if (!handler) return;
      try {
        const out = handler(btn, e);
        if (out && typeof out.catch === 'function') out.catch(showFatal);
      } catch (err) {
        showFatal(err);
      }
    });

    // Live edits to the setup form (no re-render, so typing never loses focus)
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('.player-input')) {
        const p = setup.players.find((x) => x.id === t.dataset.id);
        if (p) p.name = t.value;
        t.removeAttribute('aria-invalid');
      } else if (t.id === 'roundsInput') {
        setup.roundsText = t.value;
        t.removeAttribute('aria-invalid');
        renderSummary();
      } else if (t.id === 'customTopic') {
        setup.custom = t.value;
        t.removeAttribute('aria-invalid');
      }
    });

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'category') setup.category = t.value;
    });

    // Enter in a name field moves to the next field or adds a player
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('.player-input')) return;
      e.preventDefault();
      const row = e.target.closest('.player-row');
      const next = row && row.nextElementSibling;
      if (next) next.querySelector('input').focus();
      else addPlayer();
    });

    $('#setupForm').addEventListener('submit', (e) => {
      e.preventDefault();
      try { startGame(); } catch (err) { showFatal(err); }
    });

    const dlg = $('#confirmDialog');
    dlg.addEventListener('close', () => { if (dialogResolver) closeDialog(false); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(false); }); // backdrop click

    // Returning to a background tab: recompute from timestamps immediately
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('pageshow', tick);

    // Guard against losing a game in progress by accident
    window.addEventListener('beforeunload', (e) => {
      if (game && (phase === 'handoff' || phase === 'topic' || phase === 'timer')) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    window.addEventListener('error', (e) => { if (e.error) showFatal(e.error); });
    window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));
  }

  function init() {
    try {
      wireEvents();
      render(false);
    } catch (err) {
      showFatal(err);
    }
  }

  init();
})();
