import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import CopyButton from "../components/ui/CopyButton";
import TimeAgo from "../components/ui/TimeAgo";
import "./FinancialNewsArticle.css";

export default function FinancialNewsArticle() {
  const { id } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.token || !id) return;
    setLoading(true);
    finance.newsArticle(id, session.token)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, session?.token]);

  if (loading) return <div className="fi-article-page"><Skeleton lines={8} /></div>;
  if (!data?.article) return <div className="fi-article-page"><p>Article not found.</p></div>;
  const a = data.article;

  return (
    <div className="fi-article-page">
      <Link to="/financial-intelligence/news" className="fi-back">← Back to News</Link>

      <article className="fi-article">
        <div className="fi-article-meta">
          <span className="fi-article-source">{a.source}</span>
          <span className="fi-article-category">{a.category}</span>
          <span className="fi-article-time"><TimeAgo ts={a.published_at} /></span>
        </div>

        <h1 className="fi-article-title">{a.title}</h1>

        {a.image_url ? (
          <img src={a.image_url} alt="" className="fi-article-img" loading="lazy" />
        ) : (
          <div className="fi-article-hero" aria-hidden="true">
            <span>{(a.source || "L").slice(0, 1)}</span>
          </div>
        )}

        {a.ai_summary && (
          <div className="fi-article-section">
            <h3 className="fi-article-section-title">AI SUMMARY</h3>
            <p className="fi-article-summary">{a.ai_summary}</p>
            <div className="fi-ai-label">AI-generated summary</div>
          </div>
        )}

        {a.description && (
          <div className="fi-article-body">
            <p>{a.description}</p>
          </div>
        )}

        {a.lending_impact && (
          <div className="fi-article-section fi-article-impact">
            <h3 className="fi-article-section-title">LENDING IMPACT</h3>
            <div className="fi-impact-level">
              <span className={`fi-impact-dot fi-impact-${a.impact_level}`} />
              {(a.impact_level || "low").toUpperCase()}
            </div>
            <p>{a.lending_impact}</p>
            <div className="fi-ai-label">AI-generated analysis — for informational purposes only</div>
          </div>
        )}

        <div className="fi-article-badges">
          <div className="fi-article-badge">
            <div className="fi-article-badge-label">MARKET IMPACT</div>
            <div className={`fi-article-badge-value fi-impact-${a.market_impact}`}>{(a.market_impact || "low").toUpperCase()}</div>
          </div>
          <div className="fi-article-badge">
            <div className="fi-article-badge-label">LENDING IMPACT</div>
            <div className={`fi-article-badge-value fi-impact-${a.impact_level}`}>{(a.impact_level || "low").toUpperCase()}</div>
          </div>
          <div className="fi-article-badge">
            <div className="fi-article-badge-label">AI CONFIDENCE</div>
            <div className="fi-article-badge-value">{a.ai_confidence}%</div>
          </div>
        </div>

        {a.source_url && (
          <>
            <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="fi-source-link">
              Read full article at {a.source} →
            </a>{" "}
            <CopyButton text={a.source_url} label="Link" />
          </>
        )}
      </article>

      {data.related?.length > 0 && (
        <div className="fi-related">
          <h3 className="fi-section-title">Related Stories</h3>
          {data.related.map((r) => (
            <Link key={r.id} to={`/financial-intelligence/news/${r.id}`} className="fi-related-item">
              <span className="fi-related-source">{r.source}</span>
              <span className="fi-related-title">{r.title}</span>
              <span className="fi-related-time">{formatDate(r.published_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
