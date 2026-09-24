import React from 'react';

export const LeaveLimitFailureMessage: React.FC<{ message: string }> = ({ message }) => {
  const [head, ...rest] = message.split('\n');
  return (
    <>
      {head}
      {rest.length > 0 && (
        <span className="text-red-600">
          {`\n${rest.join('\n')}`.split(/(\d+(?:\.\d+)?)/g).map((part, i) =>
            /\d/.test(part) ? <span key={i} className="font-bold">{part}</span> : part
          )}
        </span>
      )}
    </>
  );
};
