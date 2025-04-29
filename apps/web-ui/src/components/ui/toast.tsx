import React, { useEffect, useState } from 'react';

interface ToastMessage { id: string; text: string; }

export const Toaster: React.FC = () => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      const text = customEvent.detail?.message || JSON.stringify(customEvent.detail);
      const id = Date.now().toString();
      setMessages((msgs) => [...msgs, { id, text }]);
      setTimeout(() => {
        setMessages((msgs) => msgs.filter((m) => m.id !== id));
      }, 5000);
    };
    window.addEventListener('job:update', handler);
    return () => window.removeEventListener('job:update', handler);
  }, []);

  if (messages.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 space-y-2 z-50">
      {messages.map((m) => (
        <div key={m.id} className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded">
          {m.text}
        </div>
      ))}
    </div>
  );
}; 