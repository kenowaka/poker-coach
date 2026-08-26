"use strict";

const ranks = Array.from({ length: 13 }, (_, index) => index + 2);
const rankLabel = rank => PokerEngine.RANK_LABELS[rank] || rank;
const state = {
  hole: [{ rank: 14, suit: "s", enabled: true }, { rank: 13, suit: "s", enabled: true }],
  board: [
    { rank: 2, suit: "c", enabled: true }, { rank: 7, suit: "d", enabled: true },
    { rank: 12, suit: "h", enabled: true }, { rank: 3, suit: "s", enabled: false },
    { rank: 4, suit: "c", enabled: false }
  ],
  transcript: ""
};

const element = id => document.getElementById(id);

function cardControl(card, group, index, canDisable) {
  const wrapper = document.createElement("div");
  wrapper.className = `card-slot${card.enabled ? "" : " disabled"}`;
  wrapper.dataset.group = group;
  wrapper.dataset.index = index;

  const rankSelect = document.createElement("select");
  rankSelect.setAttribute("aria-label", `${group === "hole" ? "Карманная" : "Общая"} карта ${index + 1}, достоинство`);
  ranks.forEach(rank => rankSelect.add(new Option(rankLabel(rank), rank)));
  rankSelect.value = card.rank;

  const suitSelect = document.createElement("select");
  suitSelect.className = `suit${["h", "d"].includes(card.suit) ? " red" : ""}`;
  suitSelect.setAttribute("aria-label", `${group === "hole" ? "Карманная" : "Общая"} карта ${index + 1}, масть`);
  PokerEngine.SUITS.forEach(suit => suitSelect.add(new Option(PokerEngine.SUIT_LABELS[suit], suit)));
  suitSelect.value = card.suit;

  rankSelect.addEventListener("change", () => { card.rank = Number(rankSelect.value); });
  suitSelect.addEventListener("change", () => {
    card.suit = suitSelect.value;
    suitSelect.classList.toggle("red", ["h", "d"].includes(card.suit));
  });

  wrapper.append(rankSelect, suitSelect);
  if (canDisable) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "card-toggle";
    toggle.textContent = card.enabled ? "Убрать" : "Добавить";
    toggle.addEventListener("click", () => { card.enabled = !card.enabled; renderCards(); });
    wrapper.append(toggle);
  }
  rankSelect.disabled = suitSelect.disabled = !card.enabled;
  return wrapper;
}

function renderCards() {
  element("hole-cards").replaceChildren(...state.hole.map((card, index) => cardControl(card, "hole", index, false)));
  element("board-cards").replaceChildren(...state.board.map((card, index) => cardControl(card, "board", index, true)));
}

function numberValue(id) {
  const value = Number(element(id).value.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function percent(value, signed = false) {
  const rounded = Math.round(value * 100);
  return `${signed && rounded > 0 ? "+" : ""}${rounded}%`;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const message = new SpeechSynthesisUtterance(text);
  message.lang = "ru-RU";
  message.rate = 0.92;
  speechSynthesis.speak(message);
}

function showError(message) {
  const result = element("result");
  result.classList.remove("hidden");
  result.innerHTML = `<p class="section-tag error">Проверь данные</p><h3>${escapeHtml(message)}</h3>`;
  result.scrollIntoView({ behavior: "smooth", block: "center" });
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function saveHistory(item) {
  const history = JSON.parse(localStorage.getItem("pokerCoach.history.v1") || "[]");
  history.unshift(item);
  localStorage.setItem("pokerCoach.history.v1", JSON.stringify(history.slice(0, 100)));
  renderHistory();
}

function renderResult(result) {
  const positive = result.edge >= 0;
  element("result").classList.remove("hidden");
  element("result").innerHTML = `
    <div class="result-top">
      <div><p class="section-tag">${escapeHtml(result.hand)}</p><h3>${escapeHtml(result.recommendation)}</h3></div>
      <span class="result-badge" aria-label="${positive ? "Математически достаточно" : "Математически недостаточно"}">${positive ? "✓" : "×"}</span>
    </div>
    <div class="metrics">
      <div class="metric"><strong>${percent(result.equity)}</strong><span>Эквити</span></div>
      <div class="metric"><strong>${percent(result.potOdds)}</strong><span>Нужно</span></div>
      <div class="metric"><strong>${percent(result.edge, true)}</strong><span>Запас</span></div>
    </div>
    <p class="fineprint">Monte Carlo против одной случайной руки. Диапазоны соперника, позиция, rake и ICM не учитываются.</p>`;
  element("result").scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderHistory() {
  const container = element("history");
  const history = JSON.parse(localStorage.getItem("pokerCoach.history.v1") || "[]");
  if (!history.length) { container.innerHTML = '<p class="empty">Разобранные раздачи появятся здесь.</p>'; return; }
  container.innerHTML = history.slice(0, 12).map(item => `
    <article class="history-item">
      <div class="history-item-top"><span class="history-cards">${item.holeCards.map(PokerEngine.cardLabel).join(" · ")}</span><time class="history-date">${new Date(item.createdAt).toLocaleDateString("ru-RU")}</time></div>
      <p>${escapeHtml(item.recommendation)} · ${percent(item.equity)} / нужно ${percent(item.potOdds)}</p>
    </article>`).join("");
}

function analyze() {
  const button = element("analyze");
  button.disabled = true;
  button.firstElementChild.textContent = "Считаю…";
  setTimeout(() => {
    try {
      const hole = state.hole.map(({ rank, suit }) => ({ rank, suit }));
      const board = state.board.filter(card => card.enabled).map(({ rank, suit }) => ({ rank, suit }));
      const result = PokerEngine.analyze(hole, board, numberValue("pot"), numberValue("call"), 3500);
      renderResult(result);
      saveHistory(result);
      speak(`${result.hand}. Эквити ${Math.round(result.equity * 100)} процентов. Нужно ${Math.round(result.potOdds * 100)} процентов. ${result.recommendation}.`);
    } catch (error) { showError(error.message); }
    button.disabled = false;
    button.firstElementChild.textContent = "Разобрать раздачу";
  }, 35);
}

function applyVoice() {
  state.transcript = element("transcript-input").value.trim();
  if (!state.transcript) { showError("Сначала продиктуй или введи описание раздачи"); return; }
  const parsed = PokerEngine.parseVoice(state.transcript);
  if (parsed.cards.length >= 2) {
    [state.hole[0], state.hole[1]] = parsed.cards.slice(0, 2).map(card => ({ ...card, enabled: true }));
    state.board.forEach((slot, index) => {
      const card = parsed.cards[index + 2];
      if (card) Object.assign(slot, card, { enabled: true }); else slot.enabled = false;
    });
    renderCards();
  }
  if (parsed.pot !== null) element("pot").value = parsed.pot;
  if (parsed.callAmount !== null) element("call").value = parsed.callAmount;
}

function setupVoiceRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = element("voice-button");
  if (!Recognition) {
    button.disabled = true;
    button.style.opacity = ".35";
    element("voice-status").textContent = "Используй микрофон на клавиатуре iPhone в поле ниже или выбери карты вручную.";
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "ru-RU";
  recognition.interimResults = true;
  recognition.continuous = false;
  button.addEventListener("click", () => {
    try { recognition.start(); } catch (_) { recognition.stop(); }
  });
  recognition.onstart = () => { button.classList.add("listening"); element("voice-status").textContent = "Слушаю…"; };
  recognition.onresult = event => {
    state.transcript = Array.from(event.results).map(result => result[0].transcript).join(" ");
    element("transcript-input").value = state.transcript;
  };
  recognition.onerror = event => { element("voice-status").textContent = `Голосовой ввод недоступен: ${event.error}`; };
  recognition.onend = () => { button.classList.remove("listening"); if (state.transcript) element("voice-status").textContent = "Проверь фразу и нажми «Заполнить»."; };
}

renderCards();
renderHistory();
setupVoiceRecognition();

element("analyze").addEventListener("click", analyze);
element("apply-voice").addEventListener("click", applyVoice);
element("sound-test").addEventListener("click", () => speak("Poker Coach. Звук подключен."));
element("clear-board").addEventListener("click", () => { state.board.forEach(card => { card.enabled = false; }); renderCards(); });
element("clear-history").addEventListener("click", () => { localStorage.removeItem("pokerCoach.history.v1"); renderHistory(); });

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
