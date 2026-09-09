import Button from "./Button";
import "./ErrorState.css";

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <div className="error-icon">⚠</div>
      <h3 className="error-title">Something went wrong</h3>
      <p className="error-msg">{message || "An unexpected error occurred."}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}
