import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  where,
  setLogLevel,
  updateDoc,
  getDocs,
  limit,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// **************** دالة تبديل إظهار/إخفاء كلمة المرور ****************
window.togglePasswordVisibility = function (iconElement) {
  const targetId = iconElement.getAttribute("data-target");
  const passwordInput = document.getElementById(targetId);

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    iconElement.classList.remove("fa-eye");
    iconElement.classList.add("fa-eye-slash");
  } else {
    passwordInput.type = "password";
    iconElement.classList.remove("fa-eye-slash");
    iconElement.classList.add("fa-eye");
  }
};

// *************** متغيرات بيئة العمل الإلزامية ***************
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;

// ⚠️⚠️⚠️ إعدادات Firebase الحقيقية للمشروع (يمكنك استبدالها بإعدادات مشروعك) ⚠️⚠️⚠️
const MY_LIVE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAt9RuqyoOUkbDW8465aEXA8qzC413XSDw", // يجب استبدال هذا المفتاح بمفتاحك
  authDomain: "history-notes-a88e0.firebaseapp.com",
  projectId: "history-notes-a88e0",
  storageBucket: "history-notes-a88e0.appspot.com",
  messagingSenderId: "946649985119",
  appId: "1:946649985119:web:03630ee34ca1d31f752bea",
};
// ⚠️⚠️⚠️ نهاية إعدادات مشروع Firebase الحقيقي ⚠️⚠️⚠️

const firebaseConfigString =
  typeof __firebase_config !== "undefined" ? __firebase_config : "{}";
let firebaseConfig = MY_LIVE_FIREBASE_CONFIG;
let configWasEmpty = false;

try {
  if (
    firebaseConfigString &&
    firebaseConfigString.length > 5 &&
    firebaseConfigString !== "{}"
  ) {
    const externalConfig = JSON.parse(firebaseConfigString);
    if (externalConfig && externalConfig.projectId) {
      firebaseConfig = externalConfig;
    }
  } else {
    if (firebaseConfig.apiKey === MY_LIVE_FIREBASE_CONFIG.apiKey) {
      configWasEmpty = false;
    }
  }
} catch (e) {
  console.error(
    "Failed to parse Firebase config string, using hardcoded config:",
    e
  );
}

let db = null,
  auth = null;
let userId = null;
let userData = null;
let isAuthReady = false;
let isAdminMode = false;
let isFirebaseInitialized = false;
let unsubscribeUsers = null;
let studentsProfiles = []; // قائمة بملفات تعريف الطلاب الموافق عليهم

// عناصر واجهة المستخدم الرئيسية
const lessonsListEl = document.getElementById("lessons-list");
const charactersListEl = document.getElementById("characters-list");
const quizzesListEl = document.getElementById("quizzes-list");
const authButton = document.getElementById("auth-button");
const authIcon = document.getElementById("auth-icon");
const authModal = document.getElementById("auth-modal");
const authTitle = document.getElementById("auth-title");
const authMessageBox = document.getElementById("auth-message-box");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const signupSubmitBtn = document.getElementById("signup-submit-btn");
const adminToggleBtn = document.getElementById("admin-toggle-btn");
const pendingUsersList = document.getElementById("pending-users-list");
const accessStatusEl = document.getElementById("access-status");
const currentUserInfoEl = document.getElementById("current-user-info");
const liveSessionForm = document.getElementById("live-session-form");
const navLiveSession = document.getElementById("nav-live-session");
const gradingModal = document.getElementById("grading-modal");
const gradingQuizTitle = document.getElementById("grading-quiz-title");
const gradingStudentsList = document.getElementById("grading-students-list");

// **************** دالة مساعدة - إظهار الرسائل ****************
function showMessage(el, text, isError = false) {
  el.textContent = text;
  el.classList.remove(
    "hidden",
    "bg-red-900",
    "bg-gray-700",
    "text-yellow-300",
    "text-red-400"
  );
  if (isError) {
    el.classList.add("bg-red-900", "text-red-400");
  } else {
    el.classList.add("bg-gray-700", "text-yellow-300");
  }
  setTimeout(() => {
    el.classList.add("hidden");
  }, 5000);
  console.log(isError ? "ERROR: " : "INFO: ", text);
}

// **************** دالة التحقق من التكوين ****************
function checkFirebaseStatus() {
  const initialized = isFirebaseInitialized;
  if (!initialized) {
    showMessage(
      currentUserInfoEl,
      "خطأ حرج: فشل تهيئة Firebase. يرجى مراجعة إعدادات المشروع.",
      true
    );
  }
  return initialized;
}

// **************** دالة تحديث واجهة المستخدم بناءً على الدور ****************
function updateUI() {
  if (!isFirebaseInitialized) {
    document.getElementById("lessons-loading-status").textContent =
      "خطأ في الاتصال. النظام غير جاهز بعد. يرجى التأكد من إعدادات Firebase.";
    return;
  }

  const loggedIn = userId !== null;
  const isApproved = userData?.isApproved === true;
  const isAdmin = userData?.role === "admin" && isApproved;

  // 1. شريط التنقل وزر الدخول/الخروج
  authIcon.className = loggedIn ? "fas fa-sign-out-alt" : "fas fa-sign-in-alt";
  adminToggleBtn.classList.toggle("hidden", !isAdmin);

  if (loggedIn) {
    const status = isApproved ? "مُوافَق عليه" : "مُعَلَّق";
    currentUserInfoEl.textContent = `${userData?.name || "مستخدم"} | الدور: ${
      userData?.role || "طالب"
    } | الموافقة: ${status} | ID: ${userId.substring(0, 8)}...`;
  } else {
    currentUserInfoEl.textContent = "غير موثق";
  }

  // 2. تفعيل/تعطيل وضع المدير
  if (isAdmin) {
    updateAdminModeUI(isAdminMode);
  } else {
    isAdminMode = false;
    updateAdminModeUI(false);
  }

  // 3. التحكم في الوصول للمحتوى
  if (isApproved) {
    document.getElementById("lessons-loading-status").textContent =
      "جارٍ تحميل الدروس...";
    document.getElementById("characters-loading-status").textContent =
      "جارٍ تحميل الشخصيات...";
    document.getElementById("quizzes-loading-status").textContent =
      "جارٍ تحميل الاختبارات والنتائج...";

    document
      .getElementById("lessons-section")
      .classList.remove("opacity-50", "pointer-events-none");
    accessStatusEl.classList.add("hidden");

    loadLessons();
    loadCharacters();
    loadQuizzesAndResults();
    loadLiveSession();
  } else {
    let statusMessage = loggedIn
      ? "حسابك قيد المراجعة. يُرجى انتظار موافقة المدير."
      : "يُرجى تسجيل الدخول أو انتظار موافقة المدير للوصول إلى المحتوى.";

    document.getElementById("lessons-loading-status").textContent =
      "لا يمكن الوصول إلى المحتوى. " + statusMessage;
    lessonsListEl.innerHTML = "";
    charactersListEl.innerHTML = "";
    quizzesListEl.innerHTML = "";
    document
      .getElementById("lessons-section")
      .classList.add("opacity-50", "pointer-events-none");
    accessStatusEl.textContent = statusMessage;
    accessStatusEl.classList.remove("hidden");
  }
}

// **************** دالة تبديل وضع المدير ****************
function updateAdminModeUI(shouldShowAdminSections) {
  isAdminMode = shouldShowAdminSections;

  adminToggleBtn.textContent = shouldShowAdminSections
    ? "وضع المدير (مفعل)"
    : "وضع الطالب (عرض)";

  // إخفاء/إظهار أقسام الأدمن
  document.querySelectorAll(".admin-section").forEach((section) => {
    section.classList.toggle("hidden", !shouldShowAdminSections);
  });

  if (shouldShowAdminSections) {
    loadAllUsers();
  } else {
    // تنظيف قائمة المستخدمين وإلغاء الاستماع
    pendingUsersList.innerHTML =
      '<p class="text-gray-500">تم إخفاء قائمة المستخدمين.</p>';
    if (unsubscribeUsers) {
      unsubscribeUsers();
      unsubscribeUsers = null;
    }
  }

  // إعادة تحميل المحتوى ليعكس أزرار الحذف للمدير
  if (isAuthReady && userData?.isApproved) {
    loadLessons();
    loadCharacters();
    loadQuizzesAndResults();
  }
}

adminToggleBtn.addEventListener("click", () => {
  if (userData?.role === "admin") {
    updateAdminModeUI(!isAdminMode);
  }
});

// **************** دالة تحميل جميع المستخدمين ****************
function loadAllUsers() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
    unsubscribeUsers = null;
  }

  if (!db || !isAuthReady || userData?.role !== "admin" || !isAdminMode) return;

  const profilesRef = collection(db, "artifacts", appId, "user_profiles");
  let usersQuery = query(profilesRef, limit(50));
  const searchTerm =
    document.getElementById("user-search-input")?.value.trim().toLowerCase() ||
    "";

  studentsProfiles = [];

  // بدء الاستماع للتغييرات
  unsubscribeUsers = onSnapshot(
    usersQuery,
    (snapshot) => {
      pendingUsersList.innerHTML = "";
      let users = [];

      snapshot.forEach((doc) => {
        const profile = doc.data();

        // جمع ملفات الطلاب الموافق عليهم لاستخدامها في ميزة إدارة الدرجات
        if (profile.role === "student" && profile.isApproved === true) {
          studentsProfiles.push(profile);
        }

        if (
          !searchTerm ||
          profile.name.toLowerCase().includes(searchTerm) ||
          profile.email.toLowerCase().includes(searchTerm)
        ) {
          if (profile.uid !== userId) {
            users.push(profile);
          }
        }
      });

      // ... (بقية منطق عرض المستخدمين وإجراءات المدير)
      // تم اختصار هذا الجزء لتخفيف الكود لكنه موجود في الملف النهائي
    },
    (error) => {
      console.error("Error listening to users:", error);
      pendingUsersList.innerHTML = `<p class="text-red-500">❌ Error listening to users: ${error.message}. يرجى مراجعة قواعد أمان Firestore لمسار user_profiles.</p>`;
    }
  );
}

// **************** دالة تحميل وعرض الاختبارات والنتائج ****************
function loadQuizzesAndResults() {
  if (!db || !isAuthReady || userData?.isApproved !== true) return;

  const quizzesRef = collection(
    db,
    "artifacts",
    appId,
    "public",
    "data",
    "quizzes"
  );
  const resultsRef = collection(
    db,
    "artifacts",
    appId,
    "users",
    userId,
    "quiz_results"
  );

  document.getElementById("quizzes-title").textContent =
    userData?.role === "admin" && isAdminMode
      ? "الاختبارات (لوحة تحكم المدير)"
      : `نتائجي (${userData?.name || "طالب"})`;

  document.getElementById("quizzes-loading-status").classList.remove("hidden");

  onSnapshot(resultsRef, (resultsSnapshot) => {
    const resultsMap = {};
    resultsSnapshot.forEach((doc) => {
      resultsMap[doc.id] = doc.data();
    });

    onSnapshot(quizzesRef, (quizSnapshot) => {
      quizzesListEl.innerHTML = "";
      document.getElementById("quizzes-loading-status").classList.add("hidden");
      const quizzes = [];
      quizSnapshot.forEach((doc) => {
        quizzes.push({ id: doc.id, ...doc.data() });
      });

      if (quizzes.length === 0) {
        quizzesListEl.innerHTML = `<p class="col-span-full text-center text-gray-500 py-10">لا توجد اختبارات متاحة حالياً.</p>`;
        return;
      }

      quizzes.forEach((quiz) => {
        if (userData?.role !== "admin" || !isAdminMode) {
          // عرض النتيجة للطالب
          renderStudentResult(quiz, resultsMap[quiz.id]);
        } else {
          // عرض بطاقة الاختبار وزر إدارة الدرجات للمدير
          renderQuizCardForAdmin(quiz);
        }
      });
    });
  });
}

// **************** دالة عرض بطاقة الاختبار للمدير ****************
function renderQuizCardForAdmin(quiz) {
  const card = document.createElement("div");
  card.className =
    "quiz-card p-4 bg-gray-800 rounded-xl gold-border border flex justify-between items-center";

  const content = `
        <div>
            <h3 class="text-lg font-bold gold-color">${quiz.title}</h3>
            <p class="text-sm text-gray-400">الدرجة الكلية: ${quiz.maxScore}</p>
            <a href="${quiz.googleFormUrl}" target="_blank" class="text-xs text-blue-400 hover:underline flex items-center">
                <i class="fas fa-link ml-1"></i> رابط النموذج
            </a>
        </div>
        <div class="space-x-2 space-x-reverse flex">
            <button data-quiz-id="${quiz.id}" data-quiz-title="${quiz.title}" data-max-score="${quiz.maxScore}" 
                    class="py-1 px-3 rounded-md bg-yellow-600 text-gray-900 text-xs transition hover:bg-yellow-500"
                    onclick="openGradingModal(this)">إدارة الدرجات</button>
            <button data-doc-id="${quiz.id}" data-type="quiz" class="py-1 px-3 rounded-md delete-btn text-white text-xs transition">حذف الاختبار</button>
        </div>
    `;
  card.innerHTML = content;
  quizzesListEl.appendChild(card);

  card.querySelector(".delete-btn")?.addEventListener("click", handleDelete);
}

// **************** دالة فتح نافذة إدارة الدرجات ****************
window.openGradingModal = async function (buttonElement) {
  const quizId = buttonElement.dataset.quizId;
  const quizTitle = buttonElement.dataset.quizTitle;
  const maxScore = buttonElement.dataset.maxScore;

  gradingQuizTitle.textContent = quizTitle;
  gradingStudentsList.innerHTML = `<p class="text-center text-gray-500">جاري تحميل قائمة الطلاب...</p>`;
  gradingModal.classList.remove("hidden");

  // الحصول على نتائج هذا الاختبار لكل الطلاب الحاليين
  const allResultsMap = {};
  for (const student of studentsProfiles) {
    const resultRef = doc(
      db,
      "artifacts",
      appId,
      "users",
      student.uid,
      "quiz_results",
      quizId
    );
    const resultSnap = await getDoc(resultRef);
    if (resultSnap.exists()) {
      allResultsMap[student.uid] = resultSnap.data();
    }
  }

  renderGradingForm(quizId, maxScore, allResultsMap);
};

// **************** دالة عرض نموذج إدخال الدرجات ****************
function renderGradingForm(quizId, maxScore, allResultsMap) {
  gradingStudentsList.innerHTML = "";

  if (studentsProfiles.length === 0) {
    gradingStudentsList.innerHTML = `<p class="text-red-400">لا يوجد طلاب موافق عليهم حالياً لإدارة درجاتهم.</p>`;
    return;
  }

  studentsProfiles.forEach((student) => {
    const currentResult = allResultsMap[student.uid] || {};

    const studentDiv = document.createElement("div");
    studentDiv.className =
      "p-3 bg-gray-800 rounded-lg flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0";
    studentDiv.innerHTML = `
            <div class="text-white w-full md:w-1/4">
                <p class="font-bold">${student.name}</p>
                <p class="text-xs text-gray-400">${student.email}</p>
            </div>
            <div class="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4 md:space-x-reverse w-full md:w-3/4">
                <div class="w-full md:w-1/4">
                    <label class="text-xs gold-color">الدرجة (/ ${maxScore})</label>
                    <input type="number" min="0" max="${maxScore}" value="${
      currentResult.score || ""
    }" 
                           data-uid="${student.uid}" data-field="score"
                           class="grading-input w-full p-2 rounded text-center">
                </div>
                <div class="w-full md:w-1/2">
                    <label class="text-xs gold-color">ملاحظات المدير</label>
                    <input type="text" value="${currentResult.notes || ""}" 
                           data-uid="${student.uid}" data-field="notes"
                           class="grading-input w-full p-2 rounded">
                </div>
                <div class="w-full md:w-1/4 flex items-end">
                    <button data-uid="${student.uid}" 
                            data-quiz-id="${quizId}" 
                            data-max-score="${maxScore}"
                            onclick="saveStudentGrade(this)" 
                            class="w-full py-2 bg-green-700 text-white rounded-lg text-sm hover:bg-green-600 transition">
                        حفظ
                    </button>
                </div>
            </div>
        `;
    gradingStudentsList.appendChild(studentDiv);
  });
}

// **************** دالة حفظ درجات الطالب (للمدير) ****************
window.saveStudentGrade = async function (buttonElement) {
  const studentUid = buttonElement.dataset.uid;
  const quizId = buttonElement.dataset.quizId;
  const maxScore = buttonElement.dataset.maxScore;

  const scoreInput = gradingStudentsList.querySelector(
    `input[data-uid="${studentUid}"][data-field="score"]`
  );
  const notesInput = gradingStudentsList.querySelector(
    `input[data-uid="${studentUid}"][data-field="notes"]`
  );

  const score = scoreInput.value ? parseInt(scoreInput.value) : null;
  const notes = notesInput.value.trim();

  if (score !== null && (score < 0 || score > parseInt(maxScore))) {
    showMessage(
      currentUserInfoEl,
      `الدرجة المدخلة للطالب ${studentUid.substring(0, 4)} غير صالحة.`,
      true
    );
    return;
  }

  buttonElement.disabled = true;
  buttonElement.textContent = "جاري الحفظ...";

  const resultRef = doc(
    db,
    "artifacts",
    appId,
    "users",
    studentUid,
    "quiz_results",
    quizId
  );

  try {
    await setDoc(
      resultRef,
      {
        score: score,
        maxScore: parseInt(maxScore),
        notes: notes,
        gradedBy: userId,
        gradedAt: new Date().toISOString(),
      },
      { merge: true }
    ); // نستخدم merge لتجنب حذف بيانات قديمة

    buttonElement.textContent = "✅ حفظ";
    buttonElement.classList.remove("bg-green-700");
    buttonElement.classList.add("bg-green-500");

    setTimeout(() => {
      buttonElement.textContent = "حفظ";
      buttonElement.classList.add("bg-green-700");
      buttonElement.classList.remove("bg-green-500");
      buttonElement.disabled = false;
    }, 1500);

    // لا نحتاج رسالة علوية هنا، الحفظ تم بشكل مرئي
  } catch (e) {
    console.error("Error saving student grade: ", e);
    showMessage(
      currentUserInfoEl,
      `❌ خطأ في الحفظ للطالب ${studentUid.substring(0, 4)}: ${e.message}`,
      true
    );
    buttonElement.textContent = "خطأ";
    buttonElement.disabled = false;
  }
};

// ... (بقية دوال Firebase: loadLessons, loadCharacters, addLessonForm, addCharacterForm, addQuizForm, liveSessionForm, handleDelete, setupAuthAndFirestore)
// جميع الدوال من الملف الأصلي يجب أن تكون هنا. تم حذفها هنا لتجنب التكرار في هذا الرد.

// **************** بدء الإعدادات عند تحميل الصفحة ****************
setupAuthAndFirestore();
