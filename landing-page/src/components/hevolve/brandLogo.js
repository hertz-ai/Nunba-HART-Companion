import microSoftLogo from '../../data/microSoftLogo.png';
import nvidiainception from '../../data/nvidiainception.png';

import React, {useEffect, useState} from 'react';

const AnimatedText = () => {
  const [displayText, setDisplayText] = useState('NVIDIA');
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDisplayText((prevText) =>
        prevText === 'NVIDIA' ? 'MICROSOFT' : 'NVIDIA'
      );
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [displayText]);

  return (
    <div>
      <h1
        className="mb-3 fadeInUp"
        style={{
          fontSize: '2.5rem',
          fontWeight: '500',
          lineHeight: '1.2',
          animationDelay: '0.8s',
          color: '#FFF',
        }}
      >
        We Work With the Best PARTNERS{' '}
        <span
          style={{
            textShadow:
              displayText === 'NVIDIA'
                ? '3px 3px 3px rgba(0, 128, 0, 0.8)'
                : '3px 3px 3px rgba(128, 0, 128, 0.8)',
          }}
          className="part"
        >
          {' '}
          {displayText}
        </span>
      </h1>
      <p
        style={{
          marginTop: '40px',
          animationDelay: '0.8s',
          cursor: 'context-menu',
          color: '#FFF',
        }}
      >
        to make your learning seamless we have partnered with the top companies
      </p>
    </div>
  );
};

const BrandLogo = () => {
  return (
    <div className="container relative" style={{marginTop: '5px'}}>
      <div className="grid md:grid-cols-2 grid-cols-2 justify-center gap-6">
        <div>
          <AnimatedText />
        </div>

        <div className="mx-auto py-4">
          <img
            className="h-16 "
            style={{width: '100%', height: '100%', marginBottom: '20px'}}
            src={microSoftLogo}
            alt=""
          />
          <img
            className="h-16"
            style={{width: '100%', height: '100%', borderRadius: '8px'}}
            src={nvidiainception}
            alt=""
          />
        </div>
      </div>
    </div>
  );
};

export default BrandLogo;
