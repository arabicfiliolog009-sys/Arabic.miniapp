const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

let currentLevel = localStorage.getItem('user_level') || 'A1';
let apiKey = localStorage.getItem('groq_api_key') || '';
let chatHistory = [];
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let goodResponsesCount = 0;

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2+'];
const chatBox = document.getElementById('chat-box');
const micBtn = document.getElementById('mic-btn');
const hintBtn = document.getElementById('hint-btn');
const levelBadge = document.getElementById('level-badge');
const apiModal = document.getElementById('api-modal');
const apiKeyInput = document.getElementById('api-key-input');

// Boshlang'ich sozlamalar
updateLevelUI(currentLevel);
if (!apiKey) apiModal.classList.remove('hidden');

document.getElementById('settings-btn').onclick = () => {
  apiKeyInput.value = apiKey;
  apiModal.classList.remove('hidden');
};

document.getElementById('save-api-btn').onclick = () => {
  apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    localStorage.setItem('groq_api_key', apiKey);
    apiModal.classList.add('hidden');
  }
};

document.querySelectorAll('.lvl-btn').forEach(btn => {
  btn.onclick = () => {
    currentLevel = btn.dataset.lvl;
    localStorage.setItem('user_level', currentLevel);
    updateLevelUI(currentLevel);
  };
});

function updateLevelUI(lvl) {
  levelBadge.textContent = `Daraja: ${lvl}`;
  document.querySelectorAll('.lvl-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lvl === lvl);
  });
}

// Ovoz yozish (Mikrofon tugmasi)
micBtn.onclick = async () => {
  if (!apiKey) {
    apiModal.classList.remove('hidden');
    return;
  }

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = processAudio;
      mediaRecorder.start();
      isRecording = true;
      micBtn.textContent = '⏹️ To‘xtatish';
      micBtn.classList.add('recording');
    } catch (err) {
      alert('Mikrofonga ruxsat berilmadi! Sozlamalardan ruxsat bering.');
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    micBtn.textContent = '⏳ O‘ylanmoqda...';
    micBtn.classList.remove('recording');
    micBtn.disabled = true;
  }
};

// Yordam (تلميح) tugmasi - A1/A2 lar uchun
hintBtn.onclick = async () => {
  if (!apiKey) return apiModal.classList.remove('hidden');
  hintBtn.disabled = true;
  hintBtn.textContent = '⏳...';

  const lastAiMsg = chatHistory.filter(m => m.role === 'assistant').pop()?.content || 'كَيْفَ حَالُكَ الْيَوْمَ؟';
  const prompt = `Foydalanuvchi darajasi: ${currentLevel}. Oxirgi savol: "${lastAiMsg}". Foydalanuvchiga javob berishi uchun 2 ta qisqa arabcha variant (harakatlari bilan) va o'zbekcha tarjimasini yoz.`;

  try {
    const res = await fetch('https://groq.com', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    addMessage('ai', data.choices[0].message.content, '💡 Javob berish uchun tayyor variantlar');
  } catch (e) {
    alert('Xatolik yuz berdi');
  }
  hintBtn.disabled = false;
  hintBtn.textContent = '💡 Yordam (تلميح)';
};

async function processAudio() {
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('file', audioBlob, 'speech.webm');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'ar');

  try {
    // 1. Ovozni matnga aylantirish (STT)
    const sttRes = await fetch('https://groq.com', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });
    const sttData = await sttRes.json();
    const userText = sttData.text;

    if (!userText || userText.trim().length < 2) {
      resetMic();
      return;
    }

    // 2. AI dan javob va C2+ tahlil olish (LLM)
    await getAIResponse(userText);
  } catch (err) {
    alert('Ovozni qayta ishlashda xatolik: API kalitni tekshiring.');
    resetMic();
  }
}

async function getAIResponse(userText) {
  const systemPrompt = `Sen arab tili bo'yicha A1 dan C2+ gacha olib chiquvchi professional AI suhbatdosh va IELTS uslubidagi imtihon oluvchisan.
Foydalanuvchining hozirgi darajasi: ${currentLevel}.

QOIDALAR:
1. A1/A2 darajada: Juda sodda, qisqa (1-2 gap), barcha harakatlari (tashkil) qo'yilgan arab tilida gapir, ruhlantir.
2. B1/B2 darajada: Tabiiy, hissiyotli gapir, savollar bilan bahsga tort.
3. C1/C2+ darajada: Eng yuksak adabiy arab tilida (الفصحى المعاصرة البليغة), chuqur falsafiy va mantiqiy dalillar bilan bahslash, harakatsiz yoz.
4. Har doim foydalanuvchining fikriga qarshi savol yoki qiziqarli munosabat bildir (haqiqiy jonli suhbatdoshdek emotsiya bilan).

JAVOBNI FAQAT QUYIDAGI JSON FORMATIDA QAYTAR (boshqa hech narsa yozma):
{
  "user_corrected": "Foydalanuvchi gapining to'g'rilangan shakli",
  "next_level_upgrade": "Shu gapning bir daraja yuqori (chiroyliroq) shakli",
  "c2_masterpiece": "Shu gapning C2+ darajadagi eng mukammal, akademik adabiy ko'rinishi",
  "ai_reply": "Sening arabcha hissiyotli va bahslashuvchi javobing",
  "uz_translation": "Sening javobingning qisqa o'zbekcha mazmuni",
  "ready_for_level_up": true yoki false (agar foydalanuvchi bu darajada juda yaxshi gapirgan bo'lsa true)
}`;

  chatHistory.push({ role: 'user', content: userText });

  const llmRes = await fetch('https://groq.com', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory.slice(-6)
      ],
      response_format: { type: 'json_object' }
    })
  });

  const llmData = await llmRes.json();
  const result = JSON.parse(llmData.choices[0].message.content);

  chatHistory.push({ role: 'assistant', content: result.ai_reply });

  // Foydalanuvchi gapi va C2+ Ko'prik tahlilini chiqarish
  addUserMessageWithUpgrade(userText, result);

  // AI javobini chiqarish va ovozli o'qish
  addMessage('ai', result.ai_reply, result.uz_translation);
  speakArabic(result.ai_reply);

  // Darajani avtomatik oshirish tekshiruvi
  if (result.ready_for_level_up) {
    goodResponsesCount++;
    if (goodResponsesCount >= 4) {
      promoteUserLevel();
      goodResponsesCount = 0;
    }
  }

  resetMic();
}

function addUserMessageWithUpgrade(rawText, analysis) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `
    <p class="ar-text">${rawText}</p>
    <div class="upgrade-card">
      <div class="upgrade-title">⬆️ Keyingi qadam:</div>
      <p class="ar-text" style="font-size:16px; color:#bae6fd;">${analysis.next_level_upgrade}</p>
      <div class="upgrade-title" style="margin-top:6px; color:#fbbf24;">👑 C2+ Cho'qqi:</div>
      <p class="ar-text" style="font-size:16px; color:#fde68a;">${analysis.c2_masterpiece}</p>
    </div>
  `;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addMessage(sender, arText, uzText) {
  const div = document.createElement('div');
  div.className = `msg ${sender}`;
  div.innerHTML = `
    <p class="ar-text">${arText}</p>
    ${uzText ? `<span class="uz-hint">${uzText}</span>` : ''}
  `;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function speakArabic(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ar-SA';
  utterance.rate = (currentLevel === 'A1' || currentLevel === 'A2') ? 0.85 : 1.0;
  window.speechSynthesis.speak(utterance);
}

function promoteUserLevel() {
  const idx = levels.indexOf(currentLevel);
  if (idx < levels.length - 1) {
    currentLevel = levels[idx + 1];
    localStorage.setItem('user_level', currentLevel);
    updateLevelUI(currentLevel);
    addMessage('ai', `مَبْرُوك! لَقَدِ ارْتَفَعَ مُسْتَوَاكَ إِلَى ${currentLevel}!`, `🎉 Tabriklaymiz! Sizning darajangiz avtomatik ravishda ${currentLevel} ga ko'tarildi!`);
  }
}

function resetMic() {
  micBtn.disabled = false;
  micBtn.textContent = '🎤 Gapirish';
}
