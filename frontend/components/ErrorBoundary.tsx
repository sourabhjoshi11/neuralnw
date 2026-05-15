import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Colors } from '@/constants/theme';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: Colors.bg.primary,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
            gap: 20,
          }}
        >
          <Text style={{ fontSize: 52 }}>💥</Text>
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 22,
              fontFamily: 'Poppins_700Bold',
              textAlign: 'center',
            }}
          >
            Something crashed
          </Text>
          <Text
            style={{
              color: Colors.text.secondary,
              fontSize: 14,
              fontFamily: 'Poppins_400Regular',
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          <Pressable onPress={() => this.setState({ hasError: false, error: undefined })}>
            <View
              style={{
                backgroundColor: Colors.blue,
                borderRadius: 14,
                paddingHorizontal: 28,
                paddingVertical: 13,
              }}
            >
              <Text
                style={{ color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold' }}
              >
                Try Again
              </Text>
            </View>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
