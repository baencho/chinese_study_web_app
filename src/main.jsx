import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  BookOpenText,
  ArrowLeft,
  FileUp,
  Folder,
  FolderPlus,
  Languages,
  LoaderCircle,
  LogIn,
  LogOut,
  X,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import './styles.css';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const EMPTY_FORM = { word: '', pinyin: '', meaning: '', folderId: '' };
const DESKTOP_QUERY = '(min-width: 821px) and (hover: hover) and (pointer: fine)';

function mapWordRecord(record) {
  return {
    id: record.id,
    word: record.chinese,
    pinyin: record.pinyin,
    meaning: record.meaning,
    memorized: Boolean(record.memorized),
    folderId: record.folder_id || '',
  };
}

function mapFolderRecord(record) {
  return {
    id: record.id,
    name: record.name,
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

  const rows = parseCsvRows(fileText).map((row, index) => ({
    lineNumber: index + 1,
    values: row,
  }));
  if (rows.length === 0) return [];

  const firstRow = rows[0].values.map((value) => value.trim().toLowerCase());
  const hasHeader =
    firstRow.includes('word') ||
    firstRow.includes('chinese') ||
    firstRow.includes('pinyin') ||
    firstRow.includes('meaning');
  const header = hasHeader ? firstRow : ['word', 'pinyin', 'meaning'];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const invalidRows = dataRows.filter(({ values }) => values.length !== header.length);

  if (invalidRows.length > 0) {
    const lines = invalidRows.map(({ lineNumber }) => lineNumber).join(', ');
    throw new Error(
      `${lines}번째 줄의 컬럼 수가 맞지 않습니다. 쉼표가 들어간 뜻은 큰따옴표로 감싸주세요.`,
    );
  }

  const importedEntries = dataRows
    .map(({ values, lineNumber }) => {
      const record = Object.fromEntries(
        header.map((key, index) => [key, values[index] ?? '']),
      );
      const normalizedEntry = normalizeImportedEntry(record);

      if (!normalizedEntry) {
        throw new Error(`${lineNumber}번째 줄에 비어 있는 필수값이 있습니다.`);
      }

      return normalizedEntry;
    })
    .filter(Boolean);

  return importedEntries;
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [entries, setEntries] = useState([]);
  const [folders, setFolders] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isFolderViewOpen, setIsFolderViewOpen] = useState(false);
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
      setFolders([]);
      return;
    }

    let isMounted = true;

    async function loadWords() {
      setIsLoadingWords(true);
      setErrorMessage('');

      const [foldersResult, wordsResult] = await Promise.all([
        supabase
          .from('folders')
          .select('id,name,created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('words')
          .select('id,chinese,pinyin,meaning,memorized,folder_id,created_at')
          .order('memorized', { ascending: true })
          .order('created_at', { ascending: false }),
      ]);

      if (!isMounted) return;

      if (foldersResult.error || wordsResult.error) {
        setErrorMessage(foldersResult.error?.message || wordsResult.error.message);
      } else {
        setFolders(foldersResult.data.map(mapFolderRecord));
        setEntries(wordsResult.data.map(mapWordRecord));
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
    const folderFilteredEntries = entries.filter((entry) => {
      if (!selectedFolderId) return !entry.folderId;
      return entry.folderId === selectedFolderId;
    });

    const matchingEntries = value
      ? folderFilteredEntries.filter((entry) =>
          [entry.word, entry.pinyin, entry.meaning].some((field) =>
            field.toLowerCase().includes(value),
          ),
        )
      : folderFilteredEntries;

    return [...matchingEntries].sort((firstEntry, secondEntry) => {
      if (firstEntry.memorized === secondEntry.memorized) return 0;
      return firstEntry.memorized ? 1 : -1;
    });
  }, [entries, query, selectedFolderId]);

  const folderCards = useMemo(() => {
    const countWords = (folderId) =>
      entries.filter((entry) => (folderId ? entry.folderId === folderId : !entry.folderId))
        .length;

    return [
      { id: '', name: '기본', count: countWords('') },
      ...folders.map((folder) => ({
        ...folder,
        count: countWords(folder.id),
      })),
    ];
  }, [entries, folders]);

  const selectedFolderName =
    folderCards.find((folder) => folder.id === selectedFolderId)?.name || '기본';

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

    saveEntry({ word, pinyin, meaning, folderId: form.folderId });
  };

  const saveEntry = async ({ word, pinyin, meaning, folderId }) => {
    setErrorMessage('');

    const { data, error } = await supabase
      .from('words')
      .insert({
        user_id: session.user.id,
        chinese: word,
        pinyin,
        meaning,
        memorized: false,
        folder_id: folderId || null,
      })
      .select('id,chinese,pinyin,meaning,memorized,folder_id,created_at')
      .single();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEntries((current) => [mapWordRecord(data), ...current]);
    setForm(EMPTY_FORM);
    setIsAddDialogOpen(false);
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

  const toggleMemorized = async (entry) => {
    const nextMemorized = !entry.memorized;
    const previousEntries = entries;

    setEntries((current) =>
      current.map((currentEntry) =>
        currentEntry.id === entry.id
          ? { ...currentEntry, memorized: nextMemorized }
          : currentEntry,
      ),
    );
    setErrorMessage('');

    const { error } = await supabase
      .from('words')
      .update({ memorized: nextMemorized })
      .eq('id', entry.id);

    if (error) {
      setEntries(previousEntries);
      setErrorMessage(error.message);
    }
  };

  const updateEntryFolder = async (entry, folderId) => {
    const previousEntries = entries;
    const nextFolderId = folderId || '';

    setEntries((current) =>
      current.map((currentEntry) =>
        currentEntry.id === entry.id
          ? { ...currentEntry, folderId: nextFolderId }
          : currentEntry,
      ),
    );
    setErrorMessage('');

    const { error } = await supabase
      .from('words')
      .update({ folder_id: nextFolderId || null })
      .eq('id', entry.id);

    if (error) {
      setEntries(previousEntries);
      setErrorMessage(error.message);
    }
  };

  const addFolder = async (event) => {
    event.preventDefault();

    const name = newFolderName.trim();
    if (!name || !session?.user) return;

    setErrorMessage('');
    setStatusMessage('');

    const { data, error } = await supabase
      .from('folders')
      .insert({
        user_id: session.user.id,
        name,
      })
      .select('id,name')
      .single();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const nextFolder = mapFolderRecord(data);
    setFolders((current) => [...current, nextFolder]);
    setSelectedFolderId(nextFolder.id);
    setNewFolderName('');
    setIsFolderDialogOpen(false);
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
            memorized: false,
            folder_id: form.folderId || null,
          })),
        )
        .select('id,chinese,pinyin,meaning,memorized,folder_id,created_at');

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

  const openAddDialog = () => {
    if (!canEdit) return;
    setStatusMessage('');
    setErrorMessage('');
    setForm((current) => ({
      ...current,
      folderId: selectedFolderId,
    }));
    setIsAddDialogOpen(true);
  };

  const closeAddDialog = () => {
    if (isImporting) return;
    setForm(EMPTY_FORM);
    setIsAddDialogOpen(false);
  };

  const openFolderView = (folderId) => {
    setSelectedFolderId(folderId);
    setQuery('');
    setIsFolderViewOpen(true);
  };

  const closeFolderView = () => {
    setQuery('');
    setIsFolderViewOpen(false);
  };

  const openFolderDialog = () => {
    if (!canEdit) return;
    setNewFolderName('');
    setStatusMessage('');
    setErrorMessage('');
    setIsFolderDialogOpen(true);
  };

  const closeFolderDialog = () => {
    setNewFolderName('');
    setIsFolderDialogOpen(false);
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
        <header className="study-panel" aria-label="계정 및 앱 정보">
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
        </header>

        {!isFolderViewOpen ? (
        <section className="list-panel" aria-label="폴더 목록">
          <div className="list-header">
            <div>
              <p className="eyebrow">Folders</p>
              <h2>단어 폴더</h2>
            </div>
            <div className="count-badge">
              <Folder size={18} />
              <span>{folderCards.length}개</span>
            </div>
            <button
              className="primary-button add-word-button"
              type="button"
              onClick={openFolderDialog}
              disabled={!canEdit}
              title="폴더 만들기"
            >
              <FolderPlus size={18} />
              <span>폴더 만들기</span>
            </button>
          </div>

          {session ? (
            <div className="folder-grid">
              {folderCards.map((folder) => (
                <button
                  className="folder-card"
                  type="button"
                  key={folder.id || 'default'}
                  onClick={() => openFolderView(folder.id)}
                >
                  <Folder size={22} />
                  <span>{folder.name}</span>
                  <small>{folder.count}개</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Folder size={28} />
              <p>로그인하면 폴더가 표시됩니다.</p>
            </div>
          )}
        </section>
        ) : (
        <section className="list-panel" aria-label="내가 입력한 단어 목록">
          <div className="list-header folder-view-header">
            <button
              className="secondary-button back-button"
              type="button"
              onClick={closeFolderView}
            >
              <ArrowLeft size={16} />
              <span>뒤로</span>
            </button>
            <div>
              <p className="eyebrow">Vocabulary List</p>
              <h2>{selectedFolderName}</h2>
            </div>
            <div className="count-badge">
              <BookOpenText size={18} />
              <span>{filteredEntries.length}개</span>
            </div>
            <button
              className="primary-button add-word-button"
              type="button"
              onClick={openAddDialog}
              disabled={!canEdit}
              title="단어 추가"
            >
              <Plus size={18} />
              <span>단어 추가</span>
            </button>
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
              <span role="columnheader">폴더</span>
              <span role="columnheader">외움</span>
              <span role="columnheader" aria-label="삭제" />
            </div>

            {isLoadingWords ? (
              <div className="empty-state">
                <LoaderCircle size={28} />
                <p>단어를 불러오는 중입니다.</p>
              </div>
            ) : filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => (
                <div
                  className={entry.memorized ? 'table-row memorized-row' : 'table-row'}
                  role="row"
                  key={entry.id}
                >
                  <strong role="cell" lang="zh-Hans">
                    {entry.word}
                  </strong>
                  <span role="cell">{entry.pinyin}</span>
                  <span role="cell">{entry.meaning}</span>
                  <label className="folder-cell" role="cell">
                    <span className="sr-only">{entry.word} 폴더</span>
                    <select
                      value={entry.folderId}
                      onChange={(event) => updateEntryFolder(entry, event.target.value)}
                      disabled={!session}
                    >
                      <option value="">기본</option>
                      {folders.map((folder) => (
                        <option value={folder.id} key={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="memorized-toggle" role="cell">
                    <input
                      type="checkbox"
                      checked={entry.memorized}
                      onChange={() => toggleMemorized(entry)}
                      disabled={!session}
                    />
                    <span>{entry.memorized ? '완료' : '미완료'}</span>
                  </label>
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
        )}
      </section>

      {isFolderDialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeFolderDialog}>
          <section
            className="entry-dialog compact-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folderDialogTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">New Folder</p>
                <h2 id="folderDialogTitle">폴더 만들기</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeFolderDialog}
                aria-label="닫기"
                title="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <form className="entry-form" onSubmit={addFolder}>
              <label>
                <span>폴더 이름</span>
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="예: HSK 5급"
                  disabled={!canEdit}
                  autoFocus
                />
              </label>

              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={closeFolderDialog}>
                  취소
                </button>
                <button className="primary-button" type="submit" disabled={!canEdit}>
                  <FolderPlus size={18} />
                  <span>만들기</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isAddDialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeAddDialog}>
          <section
            className="entry-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="entryDialogTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">New Word</p>
                <h2 id="entryDialogTitle">단어 추가</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeAddDialog}
                aria-label="닫기"
                title="닫기"
              >
                <X size={18} />
              </button>
            </div>

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
                  autoFocus
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

              <label>
                <span>폴더</span>
                <select
                  name="folderId"
                  value={form.folderId}
                  onChange={updateForm}
                  disabled={!canEdit}
                >
                  <option value="">기본</option>
                  {folders.map((folder) => (
                    <option value={folder.id} key={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={closeAddDialog}>
                  취소
                </button>
                <button className="primary-button" type="submit" disabled={!canEdit}>
                  <Plus size={18} />
                  <span>추가</span>
                </button>
              </div>
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
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
