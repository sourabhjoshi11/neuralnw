import { useState, useRef, useCallback } from 'react';
import { View, Pressable, Text, PanResponder, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

const COLORS = ['#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'];
const SIZES = [3, 6, 10];

type Stroke = { points: [number, number][]; color: string; width: number };

type Props = {
  isDrawer: boolean;
  isBlind: boolean;
  onDraw?: (points: [number, number][], color: string, width: number) => void;
  onClear?: () => void;
  remoteStrokes: Stroke[];
};

export function DrawCanvas({ isDrawer, isBlind, onDraw, onClear, remoteStrokes }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<[number, number][]>([]);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [showBlind, setShowBlind] = useState(false);
  const batchRef = useRef<[number, number][]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // After 5 seconds in blind mode, hide canvas from drawer
  const blindTimerStarted = useRef(false);
  if (isBlind && isDrawer && !blindTimerStarted.current) {
    blindTimerStarted.current = true;
    setTimeout(() => setShowBlind(true), 5000);
  }

  const sendBatch = useCallback(() => {
    if (batchRef.current.length > 0 && onDraw) {
      onDraw([...batchRef.current], color, strokeWidth);
      batchRef.current = [];
    }
  }, [onDraw, color, strokeWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDrawer,
      onMoveShouldSetPanResponder: () => isDrawer,
      onPanResponderGrant: (_, gesture) => {
        const point: [number, number] = [gesture.x0, gesture.y0];
        setCurrentStroke([point]);
        batchRef.current = [point];
      },
      onPanResponderMove: (_, gesture) => {
        const point: [number, number] = [gesture.moveX, gesture.moveY];
        setCurrentStroke(prev => [...prev, point]);
        batchRef.current.push(point);
        // Send batch every 100ms
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => {
            sendBatch();
            timerRef.current = null;
          }, 100);
        }
      },
      onPanResponderRelease: () => {
        sendBatch();
        if (currentStroke.length > 0) {
          setStrokes(prev => [...prev, { points: currentStroke, color, width: strokeWidth }]);
        }
        setCurrentStroke([]);
      },
    })
  ).current;

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
    onClear?.();
  };

  const handleUndo = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  const pointsToPath = (points: [number, number][]) => {
    if (points.length < 2) return '';
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i][0]} ${points[i][1]}`;
    }
    return d;
  };

  const allStrokes = isDrawer ? strokes : remoteStrokes;

  return (
    <View style={{ flex: 1 }}>
      {/* Canvas */}
      <View
        style={{ flex: 1, backgroundColor: '#1a1a2e', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
        {...(isDrawer ? panResponder.panHandlers : {})}
      >
        {isBlind && isDrawer && showBlind ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 48 }}>🙈</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_600SemiBold', marginTop: 8 }}>Blind Draw! Keep drawing from memory</Text>
          </View>
        ) : (
          <Svg style={{ flex: 1 }}>
            {allStrokes.map((s, i) => (
              <Path key={i} d={pointsToPath(s.points)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {currentStroke.length > 1 && (
              <Path d={pointsToPath(currentStroke)} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </Svg>
        )}
      </View>

      {/* Toolbar (drawer only) */}
      {isDrawer && (
        <View style={{ gap: 8, paddingTop: 10 }}>
          {/* Colors */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {COLORS.map(c => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: 14, backgroundColor: c,
                  borderWidth: color === c ? 3 : 1,
                  borderColor: color === c ? Colors.cyan : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </View>
          {/* Size + actions */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            {SIZES.map(s => (
              <Pressable
                key={s}
                onPress={() => setStrokeWidth(s)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: strokeWidth === s ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: strokeWidth === s ? Colors.cyan : 'transparent' }}>
                <View style={{ width: s + 4, height: s + 4, borderRadius: (s + 4) / 2, backgroundColor: '#fff' }} />
              </Pressable>
            ))}
            <Pressable onPress={handleUndo} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-undo" size={16} color={Colors.text.muted} />
            </Pressable>
            <Pressable onPress={handleClear} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash" size={16} color="#ef4444" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
