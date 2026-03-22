import React from 'react';
import HeroSection from './HeroSection';
import UploadSection from './UploadSection';

const LandingPage: React.FC = () => {
  return (
    <div>
      <HeroSection />
      <UploadSection />
    </div>
  );
};

export default LandingPage;