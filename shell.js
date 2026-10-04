/* Static page chrome, drawn before the app script wires it up. */
document.getElementById('app').innerHTML = `
  <header class="top">
    <div class="brand">
      <p class="eyebrow" id="docRange">&nbsp;</p>
      <h1 id="docTitle">סבב סטודנטים</h1>
      <p class="subtitle" id="docSubtitle"></p>
    </div>
    <div class="actions" id="actions">
      <span class="status" id="saveStatus" data-state="idle" role="status" aria-live="polite"></span>
      <button class="btn primary edit-only" id="btnSave" type="button" hidden>שמירה</button>
      <div class="btn-group edit-only">
        <button class="btn icon" id="btnUndo" type="button" title="ביטול (Ctrl+Z)" aria-label="ביטול">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 7H7.8l2.6-2.6L9 3 4 8l5 5 1.4-1.4L7.8 9H14a4 4 0 0 1 0 8h-3v2h3a6 6 0 0 0 0-12z"/></svg>
        </button>
        <button class="btn icon" id="btnRedo" type="button" title="חזרה (Ctrl+Y)" aria-label="חזרה">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7h6.2l-2.6-2.6L15 3l5 5-5 5-1.4-1.4L16.2 9H10a4 4 0 0 0 0 8h3v2h-3a6 6 0 0 1 0-12z"/></svg>
        </button>
      </div>
      <div class="seg" role="group" aria-label="תצוגה">
        <button class="seg-btn" id="viewGrid" type="button" aria-pressed="true">לוח</button>
        <button class="seg-btn" id="viewList" type="button" aria-pressed="false">רשימה</button>
      </div>
      <button class="btn edit-only" id="btnAdd" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
        פעילות חדשה
      </button>
      <button class="btn edit-only" id="btnSettings" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h9v2H3zm13 0h5v2h-5zM12 4h2v6h-2zM3 16h3v2H3zm7 0h11v2H10zM6 14h2v6H6z"/></svg>
        הגדרות וצבעים
      </button>
      <button class="btn ghost unlock-only" id="btnUnlock" type="button" title="כניסה לעריכה">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>
        עריכה
      </button>
      <div class="menu-wrap">
        <button class="btn" id="btnShare" type="button" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 5-1.4 1.4L13 6.8V15h-2V6.8L8.4 9.4 7 8zM5 14h2v4h10v-4h2v6H5z"/></svg>
          ייצוא
        </button>
        <div class="menu" id="shareMenu" hidden>
          <button type="button" data-export="png">תמונה (PNG) — לוואטסאפ</button>
          <button type="button" data-export="pdf">PDF — להדפסה, שבוע בכל עמוד</button>
          <button type="button" data-export="text">העתקה כטקסט</button>
          <button type="button" data-export="link">העתקת הקישור לאתר</button>
        </div>
      </div>
    </div>
  </header>

  <div class="legend" id="legend" aria-label="מקרא צבעים"></div>
  <p class="hint edit-only" id="hint">גוררים בלוק כדי להזיז אותו · מושכים את הקצה העליון או התחתון כדי לשנות שעות · לחיצה כפולה או גרירה על משבצת ריקה מוסיפה פעילות · Alt+גרירה מעתיקה</p>

  <main class="board" id="board" aria-live="off"><p class="ag-empty">טוען את הלוח…</p></main>

  <aside class="panel" id="panel" hidden aria-label="עריכת פעילות">
    <div class="panel-head">
      <h2 id="panelTitle">עריכת פעילות</h2>
      <button class="btn icon ghost" id="panelClose" type="button" aria-label="סגירה" title="סגירה (Esc)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>
      </button>
    </div>
    <form class="panel-body" id="evForm" autocomplete="off">
      <label class="field">
        <span>נושא</span>
        <input id="fTitle" type="text" placeholder="למשל: פגיעות כתף">
      </label>
      <label class="field">
        <span>מרצה / מנחה</span>
        <input id="fLecturer" type="text" placeholder="למשל: דר' יפתח בר">
      </label>
      <label class="field">
        <span>מיקום</span>
        <input id="fLocation" type="text" placeholder="למשל: חדר ישיבות אורתופדיה">
      </label>
      <label class="field">
        <span>פירוט</span>
        <textarea id="fNotes" rows="3" placeholder="מה מביאים, מה מכינים מראש…"></textarea>
      </label>
      <div class="field">
        <span id="fTypeLabel">צבע וסוג</span>
        <div class="chips" id="fTypes" role="radiogroup" aria-labelledby="fTypeLabel"></div>
      </div>
      <label class="field">
        <span>יום</span>
        <select id="fDay"></select>
      </label>
      <div class="row2">
        <label class="field">
          <span>התחלה</span>
          <input id="fStart" type="time" step="300">
        </label>
        <label class="field">
          <span>סיום</span>
          <input id="fEnd" type="time" step="300">
        </label>
      </div>
      <p class="duration" id="fDuration"></p>
      <div class="panel-actions">
        <button class="btn" id="btnDup" type="button" title="Ctrl+D">שכפול ליום הבא</button>
        <button class="btn danger" id="btnDel" type="button" title="Delete">מחיקה</button>
      </div>
    </form>
  </aside>

  <dialog class="dialog" id="settings" aria-labelledby="settingsTitle">
    <form method="dialog" class="dialog-inner" id="settingsForm" autocomplete="off">
      <div class="panel-head">
        <h2 id="settingsTitle">הגדרות וצבעים</h2>
        <button class="btn icon ghost" value="close" aria-label="סגירה">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>
        </button>
      </div>
      <div class="settings-grid">
        <fieldset>
          <legend>כותרת</legend>
          <label class="field"><span>שם הסבב</span><input id="sTitle" type="text"></label>
          <label class="field"><span>שורת משנה</span><input id="sSubtitle" type="text" placeholder="בית חולים, טיוטור, טלפון…"></label>
        </fieldset>
        <fieldset>
          <legend>תאריכים וימים</legend>
          <div class="row2">
            <label class="field"><span>תחילת הסבב (יום ראשון)</span><input id="sStart" type="date"></label>
            <label class="field"><span>מספר שבועות</span><input id="sWeeks" type="number" min="1" max="8" step="1"></label>
          </div>
          <div class="field">
            <span id="sDaysLabel">ימים בלוח</span>
            <div class="daypick" id="sDays" role="group" aria-labelledby="sDaysLabel"></div>
          </div>
        </fieldset>
        <fieldset>
          <legend>שעות</legend>
          <div class="row2">
            <label class="field"><span>הלוח מתחיל ב־</span><input id="sDayStart" type="time" step="1800"></label>
            <label class="field"><span>הלוח מסתיים ב־</span><input id="sDayEnd" type="time" step="1800"></label>
          </div>
          <div class="row2">
            <label class="field"><span>קפיצת גרירה</span>
              <select id="sSnap">
                <option value="5">5 דקות</option>
                <option value="10">10 דקות</option>
                <option value="15">15 דקות</option>
                <option value="30">30 דקות</option>
              </select>
            </label>
            <label class="field"><span>גובה שעה בלוח</span><input id="sHour" type="range" min="40" max="120" step="4"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>צבעים וסוגי פעילות</legend>
          <p class="note">שינוי צבע כאן צובע מחדש את כל הפעילויות מאותו סוג.</p>
          <div class="types" id="sTypes"></div>
          <button class="btn" id="sAddType" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
            סוג חדש
          </button>
        </fieldset>
        <fieldset>
          <legend>המכשיר הזה</legend>
          <p class="note">העריכה פתוחה במכשיר הזה. במחשב משותף כדאי לנעול אותה כשמסיימים.</p>
          <button class="btn" id="sLock" type="button">נעילת העריכה במכשיר הזה</button>
        </fieldset>
      </div>
    </form>
  </dialog>

  <dialog class="dialog narrow" id="unlockDlg" aria-labelledby="unlockTitle">
    <form class="dialog-inner" id="unlockForm" autocomplete="off">
      <div class="panel-head">
        <h2 id="unlockTitle">כניסה לעריכה</h2>
        <button class="btn icon ghost" id="unlockClose" type="button" aria-label="סגירה">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>
        </button>
      </div>
      <div class="dialog-body">
        <p class="note">רק מי שמחזיק במפתח העריכה יכול לשנות את הלוח. המפתח נשמר במכשיר הזה בלבד, וכל השאר רואים את הלוח לקריאה בלבד.</p>
        <label class="field">
          <span>מפתח עריכה</span>
          <input id="unlockKey" type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="github_pat_…">
        </label>
        <p class="form-error" id="unlockErr" role="alert" hidden></p>
        <details class="howto">
          <summary>איך יוצרים מפתח עריכה?</summary>
          <ol>
            <li>פותחים את <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">יצירת מפתח חדש ב־GitHub</a>.</li>
            <li>נותנים שם (למשל: עריכת לוח הסבב) ובוחרים תוקף.</li>
            <li>תחת Repository access בוחרים Only select repositories ואת המאגר <code id="howtoRepo">rotation</code>.</li>
            <li>תחת Permissions › Repository permissions מגדירים את Contents ל־Read and write.</li>
            <li>לוחצים Generate token, מעתיקים את המפתח ומדביקים אותו כאן.</li>
          </ol>
        </details>
        <div class="dialog-actions">
          <button class="btn primary" id="unlockGo" type="submit">כניסה</button>
        </div>
      </div>
    </form>
  </dialog>

  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
`;
