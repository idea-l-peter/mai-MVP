export function GmailLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      {/* Envelope body */}
      <path fill="#F2F2F2" d="M64 112c0-8.8 7.2-16 16-16h352c8.8 0 16 7.2 16 16v288c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112z"/>
      
      {/* Left side - Blue */}
      <path fill="#4285F4" d="M64 112v288c0 8.8 7.2 16 16 16h8V136L256 256 64 112z"/>
      
      {/* Right side - Blue */}
      <path fill="#4285F4" d="M448 112L256 256l168 160h8c8.8 0 16-7.2 16-16V112z"/>
      
      {/* Bottom left - Green */}
      <path fill="#34A853" d="M88 416l168-160v-60L64 328v72c0 8.8 7.2 16 16 16h8z"/>
      
      {/* Bottom right - Yellow */}
      <path fill="#FBBC04" d="M424 416l-168-160v-60l192 132v72c0 8.8-7.2 16-16 16h-8z"/>
      
      {/* Top M shape - Red */}
      <path fill="#EA4335" d="M424 96H88l-24 16 192 144 192-144-24-16z"/>
      <path fill="#EA4335" d="M256 256L64 112l192 144 192-144L256 256z"/>
      
      {/* Red M envelope top */}
      <path fill="#C5221F" d="M64 112l192 144 192-144"/>
      <path fill="#EA4335" d="M80 96c-8.8 0-16 7.2-16 16l192 144L448 112c0-8.8-7.2-16-16-16H80z"/>
    </svg>
  );
}
