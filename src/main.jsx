import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  BookOpenText,
  FileUp,
  Languages,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import './styles.css';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const EMPTY_FORM = { word: '', pinyin: '', meaning: '' };
const DESKTOP_QUERY = '(min-width: 821px) and (hover: hover) and (pointer: fine)';

function mapWordRecord(record) {
  return {
    id: record.id,
    word: record.chinese,
    pinyin: record.pinyin,
    meaning: record.meaning,
  };
}

function parseCsvRows(csvText) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);

  return rows;
}

function normalizeImportedEntry(entry) {
  const word = String(entry.word ?? entry.chinese ?? '').trim();
  const pinyin = String(entry.pinyin ?? '').trim();
  const meaning = String(entry.meaning ?? entry.definition ?? '').trim();

  return word && pinyin && meaning ? { word, pinyin, meaning } : null;
}

function parseImportFile(fileName, fileText) {
  if (fileName.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(fileText);
    if (!Array.isArray(parsed)) {
      throw new Error('JSON 파일은 단어 배열이어야 합니다.');
    }

    return parsed.map(normalizeImportedEntry).filter(Boolean);
  }

  const rows = parseCsvRows(fileText);
  if (rows.length === 0) return [];

  const firstRow = rows[0].map((value) => value.trim().toLowerCase());
  const hasHeader =
    firstRow.includes('word') ||
    firstRow.includes('chinese') ||
    firstRow.includes('pinyin') ||
    firstRow.includes('meaning');
  const header = hasHeader ? firstRow : ['word', 'pinyin', 'meaning'];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row) => {
      const record = Object.fromEntries(
        header.map((key, index) => [key, row[index] ?? '']),
      );
      return normalizeImportedEntry(record);
    })
    .filter(Boolean);
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isLoadingWords, setIsLoadingWords] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [canImportFiles, setCanImportFiles] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatusMessage('');
      setErrorMessage('');
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const updateCanImport = () => setCanImportFiles(mediaQuery.matches);

    updateCanImport();
    mediaQuery.addEventListener('change', updateCanImport);

    return () => {
      mediaQuery.removeEventListener('change', updateCanImport);
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setEntries([]);
      return;
    }

    let isMounted = true;

    async function loadWords() {
      setIsLoadingWords(true);
      setErrorMessage('');

      const { data, error } = await supabase
        .from('words')
        .select('id,chinese,pinyin,meaning,created_at')
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        setErrorMessage(error.message);
      } else {
        setEntries(data.map(mapWordRecord));
      }

      setIsLoadingWords(false);
    }

    loadWords();

    return () => {
      isMounted = false;
    };
  }, [session]);

  const filteredEntries = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return entries;

    return entries.filter((entry) =>
      [entry.word, entry.pinyin, entry.meaning].some((field) =>
        field.toLowerCase().includes(value),
      ),
    );
  }, [entries, query]);

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const addEntry = (event) => {
    event.preventDefault();

    if (!session?.user) return;

    const word = form.word.trim();
    const pinyin = form.pinyin.trim();
    const meaning = form.meaning.trim();

    if (!word || !pinyin || !meaning) return;

    saveEntry({ word, pinyin, meaning });
  };

  const saveEntry = async ({ word, pinyin, meaning }) => {
    setErrorMessage('');

    const { data, error } = await supabase
      .from('words')
      .insert({
        user_id: session.user.id,
        chinese: word,
        pinyin,
        meaning,
      })
      .select('id,chinese,pinyin,meaning,created_at')
      .single();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEntries((current) => [mapWordRecord(data), ...current]);
    setForm(EMPTY_FORM);
  };

  const removeEntry = async (id) => {
    const previousEntries = entries;
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setErrorMessage('');

    const { error } = await supabase.from('words').delete().eq('id', id);

    if (error) {
      setEntries(previousEntries);
      setErrorMessage(error.message);
    }
  };

  const importEntries = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !session?.user || !canImportFiles) return;

    setIsImporting(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const text = await file.text();
      const importedEntries = parseImportFile(file.name, text);

      if (importedEntries.length === 0) {
        throw new Error('가져올 수 있는 단어가 없습니다.');
      }

      const { data, error } = await supabase
        .from('words')
        .insert(
          importedEntries.map((entry) => ({
            user_id: session.user.id,
            chinese: entry.word,
            pinyin: entry.pinyin,
            meaning: entry.meaning,
          })),
        )
        .select('id,chinese,pinyin,meaning,created_at');

      if (error) throw error;

      setEntries((current) => [...data.map(mapWordRecord), ...current]);
      setStatusMessage(`${data.length}개 단어를 가져왔습니다.`);
    } catch (error) {
      setErrorMessage(error.message);
    }

    setIsImporting(false);
  };

  const preventImportWhenDisabled = (event) => {
    if (!canEdit || isImporting) {
      event.preventDefault();
    }
  };

  const submitAuth = async (event) => {
    event.preventDefault();

    const loginEmail = email.trim();
    const loginPassword = password;
    const code = invitationCode.trim();
    const isSignup = authMode === 'signup';
    if (!loginEmail || !loginPassword || (isSignup && !code)) return;

    setIsSubmittingAuth(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      if (isSignup) {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
            code,
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || '가입할 수 없습니다.');
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;

      setSession(data.session);
      setPassword('');
      setInvitationCode('');
      setStatusMessage(isSignup ? '가입하고 로그인했습니다.' : '');
    } catch (error) {
      setErrorMessage(error.message);
    }

    setIsSubmittingAuth(false);
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setStatusMessage('');
    setErrorMessage('');
  };

  const signOut = async () => {
    setStatusMessage('');
    setErrorMessage('');
    await supabase.auth.signOut();
  };

  const userEmail = session?.user?.email;
  const canEdit = Boolean(session?.user && !isLoadingWords);

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="study-panel" aria-label="중국어 단어 입력">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <Languages size={24} />
            </div>
            <div>
              <p className="eyebrow">Chinese Study</p>
              <h1>중국어 단어장</h1>
            </div>
          </div>

          {!isSupabaseConfigured ? (
            <div className="setup-state" role="status">
              <AlertCircle size={20} />
              <p>Supabase 환경변수를 먼저 설정해야 합니다.</p>
              <code>VITE_SUPABASE_URL</code>
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
            </div>
          ) : authLoading ? (
            <div className="loading-state" role="status">
              <LoaderCircle size={20} />
              <span>로그인 상태 확인 중</span>
            </div>
          ) : session ? (
            <div className="account-row">
              <span>{userEmail}</span>
              <button className="secondary-button" type="button" onClick={signOut}>
                <LogOut size={16} />
                <span>로그아웃</span>
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submitAuth}>
              <div className="auth-mode-control" aria-label="인증 방식">
                <button
                  className={authMode === 'login' ? 'active' : ''}
                  type="button"
                  onClick={() => switchAuthMode('login')}
                >
                  로그인
                </button>
                <button
                  className={authMode === 'signup' ? 'active' : ''}
                  type="button"
                  onClick={() => switchAuthMode('signup')}
                >
                  가입
                </button>
              </div>
              <label>
                <span>이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <label>
                <span>비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="6자 이상"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                />
              </label>
              {authMode === 'signup' && (
                <label>
                  <span>Invitation code</span>
                  <input
                    type="password"
                    value={invitationCode}
                    onChange={(event) => setInvitationCode(event.target.value)}
                    placeholder="초대 코드를 입력하세요"
                    autoComplete="off"
                  />
                </label>
              )}
              <button className="primary-button" type="submit" disabled={isSubmittingAuth}>
                <LogIn size={18} />
                <span>
                  {isSubmittingAuth
                    ? '처리 중'
                    : authMode === 'signup'
                      ? '가입하고 로그인'
                      : '로그인'}
                </span>
              </button>
            </form>
          )}

          {(statusMessage || errorMessage) && (
            <p className={errorMessage ? 'message error' : 'message'}>
              {errorMessage || statusMessage}
            </p>
          )}

          <form className="entry-form" onSubmit={addEntry}>
            <label>
              <span>단어</span>
              <input
                name="word"
                value={form.word}
                onChange={updateForm}
                placeholder="예: 朋友"
                autoComplete="off"
                disabled={!canEdit}
              />
            </label>

            <label>
              <span>병음</span>
              <input
                name="pinyin"
                value={form.pinyin}
                onChange={updateForm}
                placeholder="예: péng you"
                autoComplete="off"
                disabled={!canEdit}
              />
            </label>

            <label>
              <span>뜻</span>
              <input
                name="meaning"
                value={form.meaning}
                onChange={updateForm}
                placeholder="예: 친구"
                autoComplete="off"
                disabled={!canEdit}
              />
            </label>

            <button className="primary-button" type="submit" disabled={!canEdit}>
              <Plus size={18} />
              <span>목록에 추가</span>
            </button>
          </form>

          {canImportFiles && (
            <div className="import-panel">
              <input
                id="wordImportFile"
                type="file"
                accept=".csv,.json,application/json,text/csv"
                onChange={importEntries}
                disabled={!canEdit || isImporting}
              />
              <label
                className="secondary-button import-button"
                htmlFor="wordImportFile"
                aria-disabled={!canEdit || isImporting}
                onClick={preventImportWhenDisabled}
              >
                <FileUp size={16} />
                <span>{isImporting ? '가져오는 중' : 'CSV/JSON 가져오기'}</span>
              </label>
            </div>
          )}
        </aside>

        <section className="list-panel" aria-label="내가 입력한 단어 목록">
          <div className="list-header">
            <div>
              <p className="eyebrow">Vocabulary List</p>
              <h2>내 단어 목록</h2>
            </div>
            <div className="count-badge">
              <BookOpenText size={18} />
              <span>{entries.length}개</span>
            </div>
          </div>

          <div className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="단어, 병음, 뜻 검색"
              aria-label="단어 검색"
            />
          </div>

          <div className="word-table" role="table" aria-label="단어 목록">
            <div className="table-row table-head" role="row">
              <span role="columnheader">단어</span>
              <span role="columnheader">병음</span>
              <span role="columnheader">뜻</span>
              <span role="columnheader" aria-label="삭제" />
            </div>

            {isLoadingWords ? (
              <div className="empty-state">
                <LoaderCircle size={28} />
                <p>단어를 불러오는 중입니다.</p>
              </div>
            ) : filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => (
                <div className="table-row" role="row" key={entry.id}>
                  <strong role="cell" lang="zh-Hans">
                    {entry.word}
                  </strong>
                  <span role="cell">{entry.pinyin}</span>
                  <span role="cell">{entry.meaning}</span>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    aria-label={`${entry.word} 삭제`}
                    title="삭제"
                    disabled={!session}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <BookOpenText size={28} />
                <p>
                  {session
                    ? '아직 표시할 단어가 없습니다.'
                    : '로그인하면 단어 목록이 표시됩니다.'}
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
