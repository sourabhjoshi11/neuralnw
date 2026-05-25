import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from "react-native-svg";

type Props = {
  size?: number;
  animated?: boolean;
};

export function ClassChaosLogo({ size = 120 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
          <Stop offset="100%" stopColor="#06b6d4" stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#8b5cf6" stopOpacity="1" />
          <Stop offset="100%" stopColor="#ec4899" stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* Background circle */}
      <Circle cx="60" cy="60" r="58" fill="#0a0e1a" />
      <Circle cx="60" cy="60" r="56" fill="url(#grad1)" opacity="0.1" />

      {/* Main "C" shape (for Class) */}
      <Path
        d="M 75 25 A 30 30 0 1 1 75 95"
        stroke="url(#grad1)"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Inner "C" shape (for Chaos) */}
      <Path
        d="M 70 35 A 20 20 0 1 1 70 85"
        stroke="url(#grad2)"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />

      {/* Chaos dots (representing anonymity/chaos) */}
      <Circle cx="45" cy="45" r="3" fill="#fbbf24" opacity="0.8" />
      <Circle cx="55" cy="38" r="2.5" fill="#f472b6" opacity="0.8" />
      <Circle cx="48" cy="55" r="2" fill="#06b6d4" opacity="0.8" />
      <Circle cx="40" cy="50" r="2.5" fill="#8b5cf6" opacity="0.8" />
      <Circle cx="52" cy="48" r="2" fill="#3b82f6" opacity="0.8" />

      {/* Accent ring */}
      <Circle
        cx="60"
        cy="60"
        r="54"
        stroke="url(#grad1)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.3"
      />
    </Svg>
  );
}

export function ClassChaosWordmark({ width = 200, height = 60 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 60">
      <Defs>
        <LinearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
          <Stop offset="50%" stopColor="#06b6d4" stopOpacity="1" />
          <Stop offset="100%" stopColor="#8b5cf6" stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* "ClassChaos" text path - simplified for SVG */}
      <G>
        {/* C */}
        <Path d="M 15 20 A 10 10 0 1 1 15 40" stroke="url(#textGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />
        
        {/* L */}
        <Path d="M 30 20 L 30 40 L 38 40" stroke="url(#textGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />
        
        {/* A */}
        <Path d="M 43 40 L 48 20 L 53 40" stroke="url(#textGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d="M 45 32 L 51 32" stroke="url(#textGrad)" strokeWidth="2" fill="none" />
        
        {/* S */}
        <Path d="M 63 22 A 5 5 0 0 0 58 27 A 5 5 0 0 1 63 32 A 5 5 0 0 0 58 37" stroke="url(#textGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />
        
        {/* S */}
        <Path d="M 73 22 A 5 5 0 0 0 68 27 A 5 5 0 0 1 73 32 A 5 5 0 0 0 68 37" stroke="url(#textGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* Chaos - smaller, different color */}
        <Path d="M 90 25 A 7 7 0 1 1 90 38" stroke="#8b5cf6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M 102 25 L 102 38 L 107 25 L 107 38" stroke="#8b5cf6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M 115 25 L 120 38 L 125 25" stroke="#8b5cf6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M 117 32 L 123 32" stroke="#8b5cf6" strokeWidth="2" fill="none" />
        <Path d="M 135 25 A 6.5 6.5 0 0 0 130 31 A 6.5 6.5 0 0 1 135 37" stroke="#8b5cf6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </G>

      {/* Tagline */}
      <G opacity="0.6">
        <Path d="M 10 50 L 190 50" stroke="#06b6d4" strokeWidth="0.5" opacity="0.3" />
      </G>
    </Svg>
  );
}
