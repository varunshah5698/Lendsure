import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import NewsCard from "../components/finance/NewsCard";
import "./FinancialNews.css";

const CATEGORIES = ["all", "economy", "banking", "credit", "lending", "markets", "fintech", "regulation"];
const COUNTRIES = ["all", "IN", "US", "GLOBAL"];
const COUNTRY_LABELS = { all: "All Regions", IN: "India", US: "United States", GLOBAL: "Global" };
const PAGE_SIZE = 15;
const BM_KEY = "ls_news_bookmarks";

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(BM_KEY) || "{}"); }
  catch { return {}; }
}

export default function FinancialNews() {
  const { session } = useAuth();
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("all");
  const [country, setCountry] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [bookmarks, setBookmarks] = useState(loadBookmarks);
  const [savedOnly, setSavedOnly] = useState(false);
  const [newsMode, setNewsMode] = useState("seeded");

  const load = useCallback(() => {
    if (!session?.token) return;
    setLoading(true);
    finance.news({ category, country, search, page, page_size: PAGE_SIZE }, session.token)
      .then((d) => { setArticles(d.articles || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
    finance.sources(session.token)
      .then((s) => setNewsMode(s?.news_data?.mode || "seeded"))
      .catch(() => {});
  }, [session?.token, category, country, search, page]);

  useEffect(() => { setPage(1); }, [category, country, search]);
  useEffect(() => { load(); }, [load]);

  const toggleBookmark = (id) => {
    setBookmarks((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else {
        const a = articles.find((x) => x.id === id);
        if (a) next[id] = a;
      }
      try { localStorage.setItem(BM_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const savedList = Object.values(bookmarks);
  const shown = savedOnly ? savedList : articles;

  return (
    <div className="fi-news-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Live News</h1>
          <p className="fi-subtitle">
            {savedOnly ? `${savedList.length} bookmarked` : `${total} articles`} — financial intelligence for lending decisions
          </p>
        </div>
        <div className="fi-demo-badge" title={newsMode === "live" ? "Headlines ingested live from NewsAPI.org" : "Seeded dataset — set NEWS_API_KEY on the server for live headlines"}>
          <span className="fi-demo-dot" style={{ background: newsMode === "live" ? "#22c55e" : "#f59e0b", boxShadow: newsMode === "live" ? "0 0 6px #22c55e" : "none" }} />
          {newsMode === "live" ? "LIVE · NewsAPI" : "SEEDED FEED"}
        </div>
      </div>

      <div className="fi-news-filters">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search news (RBI, inflation, credit...)"
        />
        <div className="fi-filter-row">
          <div className="fi-chip-group">
            <button className={`fi-chip ${savedOnly ? "fi-chip-active" : ""}`} onClick={() => setSavedOnly(!savedOnly)}>
              ★ Saved ({savedList.length})
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} className={`fi-chip ${category === c && !savedOnly ? "fi-chip-active" : ""}`}
                onClick={() => { setCategory(c); setSavedOnly(false); }}>
                {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
          <div className="fi-chip-group">
            {COUNTRIES.map((c) => (
              <button key={c} className={`fi-chip ${country === c ? "fi-chip-active" : ""}`}
                onClick={() => setCountry(c)}>
                {COUNTRY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !savedOnly ? <Skeleton lines={5} /> : (
        <div className="fi-news-list">
          {shown.map((a) => (
            <NewsCard key={a.id} a={a} bookmarked={!!bookmarks[a.id]} onBookmark={toggleBookmark} />
          ))}
          {shown.length === 0 && (
            <div className="fi-empty">
              {savedOnly ? "No bookmarked articles yet — tap ☆ on any story to save it here." : "No articles found."}
            </div>
          )}
        </div>
      )}

      {!savedOnly && (
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}
    </div>
  );
}
