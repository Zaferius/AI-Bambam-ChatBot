import React from 'react';

const plans = [
  {
    name: 'Temel Plan',
    price: '19$/ay',
    features: ['100 kredi', 'Temel destek', 'AI Model 1'],
  },
  {
    name: 'Gelişmiş Plan',
    price: '49$/ay',
    features: ['500 kredi', 'Öncelikli destek', 'AI Model 2'],
  },
  {
    name: 'Premium Plan',
    price: '99$/ay',
    features: ['Sınırsız kredi', '7/24 destek', 'AI Model 3'],
  },
];

const PricingSection: React.FC = () => {
  return (
    <div className="text-center p-10">
      <h2 className="text-4xl font-bold">Fiyatlandırma Planları</h2>
      <div className="flex justify-center space-x-4 mt-6">
        {plans.map((plan) => (
          <div key={plan.name} className="border rounded shadow-lg p-5">
            <h3 className="text-2xl font-semibold">{plan.name}</h3>
            <p className="text-lg">{plan.price}</p>
            <ul className="mt-4">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button className="bg-blue-600 text-white px-4 py-2 mt-4 rounded">
              Satın Al
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricingSection;