import { useState } from "react";
import Card, { CardHeader, CardTitle, CardContent } from "../ui/Card";
import "./ModelPerformance.css";

export default function ModelPerformance({ model }) {
  const [expanded, setExpanded] = useState(false);

  if (!model) return null;

  return (
    <Card>
      <CardHeader>
        <div className="model-header">
          <div>
            <CardTitle>Model Performance</CardTitle>
            <p className="model-id">{model.model_id || model.artifact || "—"}</p>
          </div>
          <span className={`model-status ${model.loaded ? "model-loaded" : "model-offline"}`}>
            {model.loaded ? "Loaded" : "Offline"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="model-grid">
          <div className="model-metric">
            <span className="model-metric-label">AUC</span>
            <span className="model-metric-value">{model.test_auc ?? "—"}</span>
          </div>
          <div className="model-metric">
            <span className="model-metric-label">Accuracy</span>
            <span className="model-metric-value">{model.test_accuracy != null ? `${(model.test_accuracy * 100).toFixed(1)}%` : "—"}</span>
          </div>
          <div className="model-metric">
            <span className="model-metric-label">Precision</span>
            <span className="model-metric-value">{model.test_precision != null ? `${(model.test_precision * 100).toFixed(1)}%` : "—"}</span>
          </div>
          <div className="model-metric">
            <span className="model-metric-label">Recall</span>
            <span className="model-metric-value">{model.test_recall != null ? `${(model.test_recall * 100).toFixed(1)}%` : "—"}</span>
          </div>
        </div>

        <button className="model-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide details" : "About these metrics"}
        </button>

        {expanded && (
          <div className="model-about">
            <div className="model-about-item">
              <b>AUC (Area Under Curve)</b>
              <p>Measures the model's ability to distinguish between borrowers who will repay vs. default. 1.0 is perfect; 0.5 is random guessing.</p>
            </div>
            <div className="model-about-item">
              <b>Accuracy</b>
              <p>Percentage of correct predictions overall.</p>
            </div>
            <div className="model-about-item">
              <b>Precision</b>
              <p>Of borrowers flagged as risky, what percentage actually defaulted. High precision = fewer false alarms.</p>
            </div>
            <div className="model-about-item">
              <b>Recall</b>
              <p>Of borrowers who actually defaulted, what percentage did the model catch. High recall = fewer missed risks.</p>
            </div>
          </div>
        )}

        {model.top_drivers?.length > 0 && (
          <div className="model-drivers">
            <h4 className="model-drivers-title">Top Feature Drivers</h4>
            {model.top_drivers.slice(0, 6).map((d, i) => (
              <div key={i} className="driver-row">
                <span className="driver-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="driver-name">{d.feature}</span>
                <div className="driver-bar">
                  <div className="driver-bar-fill" style={{ width: `${Math.min(100, d.importance * 900)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {model.trained_at && (
          <div className="model-meta">
            Trained {new Date(model.trained_at).toLocaleDateString()} · {model.n_rows} rows · label rate {model.label_rate != null ? `${(model.label_rate * 100).toFixed(1)}%` : "—"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
