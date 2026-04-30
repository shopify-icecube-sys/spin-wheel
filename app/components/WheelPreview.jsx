import { useEffect } from 'react';

export default function WheelPreview({ slices }) {
  // Calculate conic gradient for the wheel
  const numSlices = slices.length;
  const sliceAngle = 360 / numSlices;
  
  let conicGradient = 'conic-gradient(';
  let currentAngle = 0;
  
  slices.forEach((slice, index) => {
    const nextAngle = currentAngle + sliceAngle;
    conicGradient += `${slice.color} ${currentAngle}deg ${nextAngle}deg${index === numSlices - 1 ? '' : ', '}`;
    currentAngle = nextAngle;
  });
  conicGradient += ')';

  return (
    <div style={{ position: 'sticky', top: '20px', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div 
        style={{
          backgroundColor: '#2b8df1',
          padding: '40px',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          maxWidth: '500px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div style={{ position: 'absolute', top: '16px', right: '16px', color: 'white', cursor: 'pointer' }}>✕</div>
        
        {/* The Wheel Container */}
        <div style={{ position: 'relative', width: '300px', height: '300px', marginTop: '20px' }}>
          {/* Wheel Pointer */}
          <div style={{
            position: 'absolute',
            top: '-15px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '0',
            height: '0',
            borderLeft: '15px solid transparent',
            borderRight: '15px solid transparent',
            borderTop: '30px solid #ff0000',
            zIndex: 10
          }} />
          
          <style>
            {`
              @keyframes slowSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>

          {/* Wheel Body */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: conicGradient,
              border: '8px solid white',
              boxSizing: 'border-box',
              position: 'relative',
              animation: 'slowSpin 15s linear infinite'
            }}
          >
            {/* Slice Text Overlay */}
            {slices.map((slice, index) => {
              const rotateAngle = (index * sliceAngle) + (sliceAngle / 2) - 90;
              return (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '130px',
                    height: '20px',
                    marginTop: '-10px',
                    transformOrigin: '0 50%',
                    transform: `rotate(${rotateAngle}deg)`,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end'
                  }}
                >
                  <span style={{
                    color: 'white',
                    fontWeight: 'bold',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap',
                    fontSize: '14px',
                    marginRight: '10px'
                  }}>
                    {slice.label}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Center Hub */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40px',
            height: '40px',
            backgroundColor: 'white',
            borderRadius: '50%',
            border: '4px solid #333',
            zIndex: 5
          }} />
        </div>
      </div>
    </div>
  );
}
