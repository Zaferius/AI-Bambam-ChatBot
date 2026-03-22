import React from 'react';

const HeroSection: React.FC = () => {
  return (
    <div className="bg-blue-600 text-white text-center p-20">
      <h1 className="text-5xl font-bold">Upload Zone</h1>
      <p className="mt-4 text-xl">Sizin için en iyi yapay zeka hizmetlerini sunuyoruz!</p>
      <button className="bg-white text-blue-600 px-4 py-2 mt-6 rounded">
        Hızla Başla
      </button>
    </div>
  );
};

export default HeroSection;