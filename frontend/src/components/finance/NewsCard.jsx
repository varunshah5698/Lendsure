import { Link } from "react-router-dom";
import TimeAgo from "../ui/TimeAgo";

export default function NewsCard({ a, bookmarked, onBookmark }) {
  return (
    <div className="fi-news-item" style={{ position: "relative" }}>
      <Link to={`/financial-intelligence/news/${a.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        <div className="fi-news-meta">
          <span className="fi-news-source">{a.source}</span>
          <span className="fi-news-category">{a.category}</span>
          <span className="fi-news-time"><TimeAgo ts={a.published_at} /></span>
          <span className={`fi-impact-badge fi-impact-${a.impact_level}`}>{a.impact_level?.toUpperCase()}</span>
        </div>
        <div className="fi-news-title">{a.title}</div>
        {a.ai_summary && <div className="fi-news-summary">{a.ai_summary}</div>}
        {a.lending_impact && (
          <div className="fi-lending-impact">
            <span className="fi-lending-label">Lending impact:</span> {a.lending_impact}
          </div>
        )}
        <div className="fi-news-footer">
          <span className="fi-confidence">AI Confidence: {a.ai_confidence}%</span>
          <span className="fi-read-more">Read →</span>
        </div>
      </Link>
      {onBookmark && (
        <button
          onClick={() => onBookmark(a.id)}
          title={bookmarked ? "Remove bookmark" : "Bookmark article"}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark article"}
          style={{
            position: "absolute", top: 10, right: 10, border: "1px solid var(--border)",
            background: "var(--bg)", borderRadius: 8, cursor: "pointer", fontSize: 14, padding: "3px 8px",
            color: bookmarked ? "var(--warning)" : "var(--text-muted)",
          }}
        >
          {bookmarked ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}
