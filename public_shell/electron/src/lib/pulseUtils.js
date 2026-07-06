/**
 * src/lib/pulseUtils.js
 *
 * Pure data-transform utilities extracted from NexusPulse.tsx.
 * These functions have no React or Electron dependencies — they are shared
 * by both the component (imported at runtime) and the test suite (required
 * directly), ensuring the tests always exercise the real production logic.
 */

/**
 * Groups a flat message array into conversation threads, sorted with the
 * most-recently-active thread first.
 *
 * Rules:
 * - Messages are grouped by sender_phone.
 * - latest_message is the message with the highest received_at timestamp.
 * - sender_name resolves to the first non-"Unknown Parent" name encountered
 *   across all messages for that phone, biasing toward the most recent.
 *
 * @param {Array} messages - Flat InboxMessage array
 * @returns {Array} ConversationThread[]
 */
export function buildThreads(messages) {
  const map = {};
  const sorted = [...messages].sort(
    (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  sorted.forEach(msg => {
    const phone = msg.sender_phone;
    if (!map[phone]) {
      map[phone] = {
        sender_phone: phone,
        sender_name: msg.sender_name,
        latest_message: msg,
        messages: [],
      };
    }
    map[phone].messages.push(msg);
    if (new Date(msg.received_at).getTime() >= new Date(map[phone].latest_message.received_at).getTime()) {
      map[phone].latest_message = msg;
      if (msg.sender_name !== 'Unknown Parent') {
        map[phone].sender_name = msg.sender_name;
      }
    }
  });

  return Object.values(map).sort(
    (a, b) =>
      new Date(b.latest_message.received_at).getTime() -
      new Date(a.latest_message.received_at).getTime()
  );
}

/**
 * Returns only the unread incoming messages from a list.
 * Used for the inbox badge count and the mark-read gate.
 *
 * @param {Array} messages
 * @returns {Array}
 */
export function filterUnread(messages) {
  return messages.filter(m => m.direction !== 'outgoing' && m.status === 'unread');
}

/**
 * Finds the most recent incoming message by reversing the array.
 * This is the target message for an admin reply.
 *
 * @param {Array} messages
 * @returns {Object|null}
 */
export function findLatestIncoming(messages) {
  return [...messages].reverse().find(m => m.direction !== 'outgoing') || null;
}

/**
 * Derives new bot UI state from an incoming WhatsApp status event.
 * Returns plain state values so the caller applies them to React setters.
 *
 * @param {{ status: string, data?: any }} val
 * @returns {{ botStatus: string, botStatusDesc: string, qrCodeDataUrl: string, loadingAction: boolean }}
 */
export function botStatusReducer(val) {
  const { status, data } = val;
  let botStatusDesc = '';
  let qrCodeDataUrl = '';
  const loadingAction = false; // always reset on any incoming event

  switch (status) {
    case 'starting':
      botStatusDesc = 'Please wait while the WhatsApp engine starts.';
      break;
    case 'qr':
      botStatusDesc = 'Open WhatsApp on the school phone → Linked Devices → Link a Device → Scan code.';
      if (data) qrCodeDataUrl = data;
      break;
    case 'authenticated':
      botStatusDesc = 'Session verified. The bot will be ready in a moment.';
      break;
    case 'ready':
      botStatusDesc = 'Parents can now WhatsApp the school number to check results, attendance & fees.';
      break;
    case 'error':
      botStatusDesc = data ? `Error: ${data}` : 'Bot encountered an initialization error.';
      break;
    case 'disconnected':
    default:
      botStatusDesc = 'Click "Start Bot" to initialise the WhatsApp engine. Scan the QR code.';
      break;
  }

  return { botStatus: status, botStatusDesc, qrCodeDataUrl, loadingAction };
}

/**
 * Persists the bot autostart preference to localStorage and notifies the
 * main process via electronAPI.send.
 *
 * @param {boolean}  checked
 * @param {Storage}  storage     - window.localStorage (or a mock in tests)
 * @param {object}   electronAPI - window.electronAPI (or null when absent)
 */
export function autostartPersist(checked, storage, electronAPI) {
  storage.setItem('nexus_pulse_autostart', checked ? 'true' : 'false');
  if (electronAPI?.send) electronAPI.send('pulse:set-autostart', checked);
}

/**
 * Deduplication guard for pulse:new-message IPC events.
 * Returns the same array reference (no re-render) if the message id is
 * already present; otherwise prepends the new message.
 *
 * @param {Array}  prev
 * @param {Object} newMsg
 * @returns {Array}
 */
export function applyNewMessage(prev, newMsg) {
  if (prev.some(m => m.id === newMsg.id)) return prev;
  return [newMsg, ...prev];
}
