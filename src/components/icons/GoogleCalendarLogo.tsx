export function GoogleCalendarLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect x="24" y="24" width="152" height="152" rx="8" fill="#fff"/>
      
      {/* Calendar frame */}
      <path d="M176 40H24c-8.8 0-16 7.2-16 16v120c0 8.8 7.2 16 16 16h152c8.8 0 16-7.2 16-16V56c0-8.8-7.2-16-16-16z" fill="#fff" stroke="#4285F4" strokeWidth="0"/>
      
      {/* Top bar with hooks */}
      <rect x="24" y="24" width="152" height="36" rx="4" fill="#4285F4"/>
      
      {/* Calendar hooks */}
      <rect x="56" y="16" width="12" height="24" rx="4" fill="#1A73E8"/>
      <rect x="132" y="16" width="12" height="24" rx="4" fill="#1A73E8"/>
      
      {/* Grid background */}
      <rect x="24" y="60" width="152" height="116" fill="#fff"/>
      
      {/* Bottom left corner - Blue */}
      <rect x="24" y="136" width="40" height="40" fill="#4285F4"/>
      
      {/* Bottom right corner - Green */}
      <rect x="136" y="136" width="40" height="40" fill="#34A853"/>
      
      {/* Top right corner - Yellow */}
      <rect x="136" y="60" width="40" height="40" fill="#FBBC04"/>
      
      {/* Top left corner - Red */}
      <rect x="24" y="60" width="40" height="40" fill="#EA4335"/>
      
      {/* Center area - white */}
      <rect x="64" y="60" width="72" height="116" fill="#fff"/>
      <rect x="24" y="100" width="152" height="36" fill="#fff"/>
      
      {/* 31 text */}
      <text x="100" y="145" textAnchor="middle" fontFamily="Google Sans, Roboto, Arial, sans-serif" fontSize="56" fontWeight="500" fill="#70757A">31</text>
    </svg>
  );
}
