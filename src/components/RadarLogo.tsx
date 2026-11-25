export function RadarLogo() {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="14" cy="14" r="12" stroke="#0F2744" strokeWidth="1.75" />
        <circle cx="14" cy="14" r="7.5" stroke="#1B4965" strokeWidth="1.25" strokeOpacity="0.65" />
        <path
          d="M14 2V6M14 22V26M2 14H6M22 14H26"
          stroke="#0F2744"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeOpacity="0.45"
        />
        <path
          d="M14 14L21.5 7.5"
          stroke="#0F2744"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="14" cy="14" r="2.5" fill="#0F2744" />
      </svg>
      <span className="font-[var(--font-display)] text-lg font-bold tracking-tight text-[#0F2744]">
        RadarAedes
      </span>
    </span>
  );
}
