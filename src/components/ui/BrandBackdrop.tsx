/** The soft stage behind the loading / not-found screens: two slowly drifting glows in the company's primary colour and a faint grid. Plain CSS classes + theme tokens. */
export default function BrandBackdrop() {
  return (
    <div aria-hidden className="app-backdrop">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />
      <div className="app-grid absolute inset-0" />
    </div>
  );
}
