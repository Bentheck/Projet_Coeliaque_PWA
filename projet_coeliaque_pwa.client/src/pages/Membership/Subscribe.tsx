import React, { useState } from 'react';

const Subscribe: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement subscription logic (API call)
    setSubmitted(true);
  };

  return (
    <div className="subscribe-page">
      <h1>Subscribe</h1>
      {submitted ? (
        <p>Thank you for subscribing!</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address:</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <button type="submit">Subscribe</button>
        </form>
      )}
    </div>
  );
};

export default Subscribe;
