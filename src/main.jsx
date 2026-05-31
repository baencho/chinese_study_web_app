import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpenText, Languages, Plus, Search, Trash2 } from 'lucide-react';
import './styles.css';
import starterWords from './data/words.json';

const STORAGE_KEY = 'chinese-vocabulary-entries';

function loadEntries() {
  const savedEntries = window.localStorage.getItem(STORAGE_KEY);

  if (!savedEntries) return starterWords;

  try {
    const parsedEntries = JSON.parse(savedEntries);
    return Array.isArray(parsedEntries) ? parsedEntries : starterWords;
  } catch {
    return starterWords;
  }
}

function App() {
  const [entries, setEntries] = useState(loadEntries);
  const [form, setForm] = useState({ word: '', pinyin: '', meaning: '' });
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

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

    const word = form.word.trim();
    const pinyin = form.pinyin.trim();
    const meaning = form.meaning.trim();

    if (!word || !pinyin || !meaning) return;

    setEntries((current) => [
      { id: Date.now(), word, pinyin, meaning },
      ...current,
    ]);
    setForm({ word: '', pinyin: '', meaning: '' });
  };

  const removeEntry = (id) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  };

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

          <form className="entry-form" onSubmit={addEntry}>
            <label>
              <span>단어</span>
              <input
                name="word"
                value={form.word}
                onChange={updateForm}
                placeholder="예: 朋友"
                autoComplete="off"
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
              />
            </label>

            <button className="primary-button" type="submit">
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

            {filteredEntries.length > 0 ? (
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
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <BookOpenText size={28} />
                <p>아직 표시할 단어가 없습니다.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
