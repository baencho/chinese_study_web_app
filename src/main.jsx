import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  BookOpenText,
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

function mapWordRecord(record) {
  return {
    id: record.id,
    word: record.chinese,
    pinyin: record.pinyin,
    meaning: record.meaning,
  };
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isLoadingWords, setIsLoadingWords] = useState(false);
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

  const sendLoginLink = async (event) => {
    event.preventDefault();

    const loginEmail = email.trim();
    const code = invitationCode.trim();
    if (!loginEmail || !code) return;

    setIsSendingLink(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/request-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail,
          code,
          redirectTo: window.location.origin,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '로그인 링크를 보낼 수 없습니다.');
      }

      setStatusMessage('이메일로 로그인 링크를 보냈습니다.');
    } catch (error) {
      setErrorMessage(error.message);
    }

    setIsSendingLink(false);
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
            <form className="auth-form" onSubmit={sendLoginLink}>
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
                <span>Invitation code</span>
                <input
                  type="password"
                  value={invitationCode}
                  onChange={(event) => setInvitationCode(event.target.value)}
                  placeholder="초대 코드를 입력하세요"
                  autoComplete="off"
                />
              </label>
              <button className="primary-button" type="submit" disabled={isSendingLink}>
                <LogIn size={18} />
                <span>{isSendingLink ? '전송 중' : '로그인 링크 받기'}</span>
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
