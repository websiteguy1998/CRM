export default function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "bg-orange-100 text-orange-700"
      : score >= 40
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`badge ${tone}`}>
      {score >= 70 ? "🔥 " : ""}
      {score}/100
    </span>
  );
}
