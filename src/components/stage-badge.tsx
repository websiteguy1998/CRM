import { stageColor } from "@/lib/format";

export default function StageBadge({
  name,
  isWon,
  isLost,
}: {
  name: string;
  isWon?: boolean;
  isLost?: boolean;
}) {
  return <span className={`badge ${stageColor(name, isWon, isLost)}`}>{name}</span>;
}
