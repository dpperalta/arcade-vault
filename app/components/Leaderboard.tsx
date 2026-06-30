import type { ScoreRow } from "../data/scores";

export default function Leaderboard({
  scores,
  title = "MEJORES PUNTUACIONES",
}: {
  scores: ScoreRow[];
  title?: string;
}) {
  return (
    <div className="leaderboard">
      <h3>{title}</h3>
      {scores.map((r, i) => (
        <div
          key={r.name}
          className={
            "lb-row" +
            (i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "")
          }
        >
          <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
          <div className="pl">
            {r.name}
            <div
              style={{
                fontSize: 10,
                color: "var(--ink-faint)",
                letterSpacing: "0.1em",
              }}
            >
              {r.date}
            </div>
          </div>
          <div className="sc">{r.score.toLocaleString("es-ES")}</div>
        </div>
      ))}
    </div>
  );
}
