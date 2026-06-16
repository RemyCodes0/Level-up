import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, staticFile } from 'remotion';

// Helper Components

const Parabola = ({ offset = 0, color = '#4ade80', width = 600, height = 400, label = '' }) => {
  const frame = useCurrentFrame();
  const duration = 300; // Approximation for drawing animation
  const progress = Math.min(frame / duration, 1);
  
  // Simple quadratic bezier curve representing y = x^2 (inverted visually for screen coords)
  // M start_x start_y Q control_x control_y end_x end_y
  const pathD = `M 0 ${height} Q ${width / 2} ${height - 200} ${width} ${height}`;
  
  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={400}
        strokeDashoffset={interpolate(progress, [0, 1], [400, 0])}
        strokeLinecap="round"
      />
      {label && (
        <text
          x={width / 2}
          y={height - offset - 20}
          fill={color}
          fontSize="20"
          fontFamily="sans-serif"
          textAnchor="middle"
          opacity={progress}
        >
          {label}
        </text>
      )}
    </g>
  );
};

const AnimatedText = ({ text, delay = 0, duration = 20, style = {}, size = 40, color = '#ffffff' }) => {
  const frame = useCurrentFrame();
  const progress = Math.max(0, Math.min(1, (frame - delay) / duration));
  const opacity = interpolate(progress, [0, 0.2, 1, 1], [0, 0, 1, 1]);
  const y = interpolate(progress, [0, 1], [50, 0]);
  
  return (
    <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>
      <h1 style={{ fontSize: `${size}px`, color, fontFamily: 'sans-serif', margin: 0 }}>
        {text}
      </h1>
    </div>
  );
};

const Arrow = ({ from, to, color = '#ffffff', label = '', delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = Math.max(0, Math.min(1, (frame - delay) / 30));
  const x = interpolate(progress, [0, 1], [from, to]);
  
  return (
    <g style={{ opacity: progress }}>
      <line x1={from} y1={100} x2={x} y2={100} stroke={color} strokeWidth="4" markerEnd="url(#arrowhead)" />
      {label && (
        <text x={interpolate(progress, [0, 1], [from, to])} y={130} fill={color} fontSize="24" fontFamily="sans-serif" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
};

const Checklist = ({ items, delay = 0 }) => {
  const frame = useCurrentFrame();
  const itemDelay = 10;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '100px' }}>
      {items.map((item, index) => {
        const itemProgress = Math.max(0, Math.min(1, (frame - delay - (index * itemDelay)) / 40));
        const checkOpacity = interpolate(itemProgress, [0, 0.5, 1], [0, 1, 1]);
        
        return (
          <div key={index} style={{ display: 'flex', alignItems: 'center', opacity: itemProgress }}>
            <div style={{ 
              width: '30px', height: '30px', 
              border: '2px solid white', 
              borderRadius: '50%', 
              marginRight: '15px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{ 
                width: '15px', height: '15px', 
                backgroundColor: 'white', 
                borderRadius: '50%',
                opacity: checkOpacity
              }} />
            </div>
            <span style={{ color: 'white', fontSize: '24px', fontFamily: 'sans-serif' }}>{item}</span>
          </div>
        );
      })}
    </div>
  );
};

const MathStep = ({ left, right, delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = Math.max(0, Math.min(1, (frame - delay) / 30));
  const opacity = interpolate(progress, [0, 0.2, 1], [0, 0, 1]);
  
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '20px', 
      opacity, 
      marginTop: '50px' 
    }}>
      <div style={{ fontSize: '32px', color: 'white', fontFamily: 'monospace' }}>{left}</div>
      <div style={{ fontSize: '32px', color: '#facc15', fontFamily: 'monospace' }}>→</div>
      <div style={{ fontSize: '32px', color: 'white', fontFamily: 'monospace' }}>{right}</div>
    </div>
  );
};

const HighlightText = ({ text, highlightIndices = [], size = 32, delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = Math.max(0, Math.min(1, (frame - delay) / 40));
  const opacity = interpolate(progress, [0, 0.5, 1], [0, 1, 1]);

  const words = text.split(' ');
  
  return (
    <div style={{ opacity, fontSize: `${size}px`, fontFamily: 'monospace', color: 'white', textAlign: 'center' }}>
      {words.map((word, i) => {
        const isHighlighted = highlightIndices.includes(i);
        const wordOpacity = interpolate(progress, [0, 1], [0, 1]);
        return (
          <span key={i} style={{ 
            color: isHighlighted ? '#facc15' : 'white', 
            display: 'inline-block', 
            marginRight: '10px',
            transition: 'color 0.3s'
          }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};

// Main Component

export const Lesson270b3526 = () => {
  const { fps } = useVideoConfig();

  return (
    <Series>
      {/* Scene 1: Intro */}
      <Sequence durationInFrames={264} name="Scene1">
        <Audio src={staticFile("audio/86b99894-28ae-46e1-8315-b35b1724b07c.mp3")} />
        <AbsoluteFill style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <AnimatedText text="Introduction to Antiderivatives" delay={10} duration={30} size={48} />
          <div style={{ marginTop: '40px', opacity: interpolate(useCurrentFrame(), [0, 264], [0, 1]) }}>
            <svg width="200" height="100" viewBox="0 0 200 100">
              <path d="M 40 100 Q 100 0 160 100" fill="none" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
              <path d="M 20 100 L 180 100" fill="none" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 2: Concept */}
      <Sequence durationInFrames={290} name="Scene2">
        <Audio src={staticFile("audio/0708de8a-1e52-45ff-83d9-a3de715e66cc.mp3")} />
        <AbsoluteFill style={{ background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'absolute', top: '50px', color: 'white', fontSize: '28px', fontFamily: 'sans-serif', opacity: interpolate(useCurrentFrame(), [0, 290], [0, 1]) }}>
            Definition: F(x) where F'(x) = f(x)
          </div>
          <div style={{ position: 'relative', width: 600, height: 400 }}>
            <Parabola />
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <svg width="60" height="60" viewBox="0 0 60 60">
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#facc15" />
                  </marker>
                </defs>
                <circle cx={0} cy={0} r="25" fill="rgba(250, 204, 21, 0.2)" stroke="#facc15" strokeWidth="2" />
                <line x1="0" y1="0" x2="15" y2="15" stroke="#facc15" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 3: Diagram */}
      <Sequence durationInFrames={371} name="Scene3">
        <Audio src={staticFile("audio/23264028-44b4-44ee-a578-f4660de013e7.mp3")} />
        <AbsoluteFill style={{ background: '#1e1b4b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '40px', color: 'white', fontFamily: 'monospace', marginBottom: '50px' }}>
            <span style={{ color: '#4ade80' }}>f(x)</span> 
            <Arrow from={150} to={350} color="#4ade80" label="Derivative" delay={10} />
            <span style={{ color: '#facc15', marginLeft: '20px' }}>f'(x)</span>
          </div>
          
          <div style={{ fontSize: '40px', color: 'white', fontFamily: 'monospace', marginTop: '50px' }}>
            <span style={{ color: '#facc15' }}>f'(x)</span>
            <Arrow from={450} to={250} color="#facc15" label="Antidifferentiation" delay={100} />
            <span style={{ color: '#60a5fa', marginLeft: '20px' }}>F(x)</span>
          </div>
          
          <div style={{ marginTop: '100px', opacity: interpolate(useCurrentFrame(), [0, 371], [0, 1]) }}>
            <h1 style={{ fontSize: '36px', color: '#facc15', fontFamily: 'sans-serif' }}>Inverse Operation</h1>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 4: Constant */}
      <Sequence durationInFrames={330} name="Scene4">
        <Audio src={staticFile("audio/d7c80d90-2eb3-4a9b-b11b-09d4d4fa95c0.mp3")} />
        <AbsoluteFill style={{ background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '28px', color: 'white', fontFamily: 'sans-serif', marginBottom: '20px' }}>Adding a constant C</div>
          <div style={{ position: 'relative', width: 600, height: 400 }}>
            <Parabola offset={0} color="#3b82f6" label="y = x²" />
            <Parabola offset={50} color="#ef4444" label="y = x² + 1" />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 5: Infinite Solutions */}
      <Sequence durationInFrames={324} name="Scene5">
        <Audio src={staticFile("audio/fb666a5b-3391-405e-b0b9-bcf1eaaa4786.mp3")} />
        <AbsoluteFill style={{ background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '32px', color: 'white', fontFamily: 'sans-serif', marginBottom: '40px' }}>Infinite Solutions</div>
          <div style={{ position: 'relative', width: 600, height: 400 }}>
            <Parabola offset={0} color="#64748b" label="y = x²" />
            <Parabola offset={60} color="#94a3b8" label="y = x² + 1" />
            <Parabola offset={150} color="#cbd5e1" label="y = x² + 5" />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 6: Notation */}
      <Sequence durationInFrames={334} name="Scene6">
        <Audio src={staticFile("audio/421793f3-7007-4e24-9d98-216b96847c7c.mp3")} />
        <AbsoluteFill style={{ background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '32px', color: 'white', fontFamily: 'monospace', marginBottom: '40px' }}>Notation: F(x) + C</div>
          <div style={{ fontSize: '40px', fontFamily: 'monospace' }}>
            <span style={{ color: 'white' }}>f(x)</span>
            <span style={{ color: '#facc15', fontSize: '50px' }}>→</span>
            <span style={{ color: 'white', fontSize: '60px', fontWeight: 'bold' }}>F(x)</span>
            <span style={{ color: 'white' }}> + C</span>
          </div>
          <div style={{ marginTop: '40px', color: '#60a5fa', fontSize: '24px', opacity: interpolate(useCurrentFrame(), [0, 334], [0, 1]) }}>
            The Constant of Integration
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 7: Process */}
      <Sequence durationInFrames={229} name="Scene7">
        <Audio src={staticFile("audio/48f97d5e-5d86-45cb-a642-4045312feb5d.mp3")} />
        <AbsoluteFill style={{ background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '36px', color: 'white', fontFamily: 'sans-serif', marginBottom: '60px' }}>The Process: Antidifferentiation</div>
          <Checklist items={['Find the antiderivative', 'Add the constant C', 'Simplify if needed']} delay={20} />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 8: Example */}
      <Sequence durationInFrames={207} name="Scene8">
        <Audio src={staticFile("audio/4d35d41c-ae35-4a8c-80b4-73d3c757bbdf.mp3")} />
        <AbsoluteFill style={{ background: '#1e1b4b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '28px', color: '#facc15', fontFamily: 'sans-serif', marginBottom: '40px' }}>Example: Integral of 3x^2</div>
          <MathStep left="d/dx(x³) =" right="3x²" delay={10} />
          <MathStep left="∫ 3x² dx =" right="x³ + C" delay={100} />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 9: Power Rule */}
      <Sequence durationInFrames={211} name="Scene9">
        <Audio src={staticFile("audio/ea39ec7b-d207-4b5f-9622-0c7fc26ad83b.mp3")} />
        <AbsoluteFill style={{ background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '32px', color: 'white', fontFamily: 'monospace' }}>
            <HighlightText text="x⁴ -> x⁵ / 5" highlightIndices={[2, 4, 6]} delay={10} />
          </div>
          <div style={{ marginTop: '60px', fontSize: '20px', color: '#94a3b8', fontFamily: 'sans-serif' }}>
            Increase exponent by 1, divide by new exponent
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 10: Summary */}
      <Sequence durationInFrames={292} name="Scene10">
        <Audio src={staticFile("audio/112b0f14-0616-4b28-a2b0-754beb6df420.mp3")} />
        <AbsoluteFill style={{ background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '36px', color: '#facc15', fontFamily: 'sans-serif', marginBottom: '50px' }}>Recap & Key Takeaways</div>
          
          <div style={{ width: '600px' }}>
            <div style={{ display: 'flex', marginBottom: '20px', opacity: interpolate(useCurrentFrame(), [0, 292], [0, 1], { start: 0, end: 1, extrapolateRight: 'clamp' }) }}>
              <span style={{ color: '#facc15', marginRight: '15px' }}>1.</span>
              <span style={{ color: 'white', fontSize: '24px', fontFamily: 'sans-serif' }}>Antiderivative is the inverse of differentiation.</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '20px', opacity: interpolate(useCurrentFrame(), [0, 292], [0, 1], { start: 20, end: 1, extrapolateRight: 'clamp' }) }}>
              <span style={{ color: '#facc15', marginRight: '15px' }}>2.</span>
              <span style={{ color: 'white', fontSize: '24px', fontFamily: 'sans-serif' }}>Always add +C at the end.</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '20px', opacity: interpolate(useCurrentFrame(), [0, 292], [0, 1], { start: 40, end: 1, extrapolateRight: 'clamp' }) }}>
              <span style={{ color: '#facc15', marginRight: '15px' }}>3.</span>
              <span style={{ color: 'white', fontSize: '24px', fontFamily: 'sans-serif' }}>Use the Power Rule: n -> n+1, divide by n+1.</span>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </Series>
  );
};