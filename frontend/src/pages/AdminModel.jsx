import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { admin } from "../lib/api";
import PageHeader from "../components/layout/PageHeader";
import ModelPerformance from "../components/dashboard/ModelPerformance";
import ErrorState from "../components/ui/ErrorState";
import { SkeletonCard } from "../components/ui/Skeleton";

export default function AdminModel() {
  const { session } = useAuth();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    admin.model(session.token).then(setModel).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div><PageHeader title="Model Performance" /><SkeletonCard /></div>;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Model Performance" description="ML model metrics and feature importance analysis" />
      <ModelPerformance model={model} />
    </div>
  );
}
