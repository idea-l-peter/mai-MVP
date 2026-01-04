export function GmailLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <path fill="#f2f2f2" d="M464 64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V112c0-26.51-21.49-48-48-48z"/>
      <path fill="#d54c3f" d="M48 400c-26.51 0-48-21.49-48-48V112L220.69 268.69a32 32 0 0 0 45.25 0L512 112v240c0 26.51-21.49 48-48 48H48z"/>
      <path fill="#b63524" d="M256 268.69L512 112v-0.01c0-26.51-21.49-48-48-48H48c-26.51 0-48 21.49-48 48L256 268.69z"/>
      <path fill="#f2f2f2" d="M48 64h16.18L256 214.32 447.82 64H464c26.51 0 48 21.49 48 48L256 285.69 0 112c0-26.51 21.49-48 48-48z"/>
    </svg>
  );
}
