import { useState, useEffect, useRef, useMemo } from 'react';
import type { StateId, ExpressionId, ShapeId, ColorId } from '../lib/bloub-engine';

export interface UseAgentMascotStateProps {
  isStreaming?: boolean;
  hasActiveTool?: boolean;
  isTyping?: boolean;
  hasError?: boolean;
  defaultShape?: ShapeId;
  defaultColor?: ColorId | string;
  defaultExpression?: ExpressionId;
}

export interface MascotStateResult {
  state: StateId;
  expression: ExpressionId;
  shape: ShapeId;
  color: ColorId | string;
  followPointer: boolean;
  isBursting: boolean;
}

export function useAgentMascotState({
  isStreaming = false,
  hasActiveTool = false,
  isTyping = false,
  hasError = false,
  defaultShape = 'cercle',
  defaultColor = 'encre',
  defaultExpression = 'neutre',
}: UseAgentMascotStateProps = {}): MascotStateResult {
  const [activeState, setActiveState] = useState<StateId>('idle');
  const [activeExpr, setActiveExpr] = useState<ExpressionId>(defaultExpression);
  const [isBursting, setIsBursting] = useState(false);

  const prevStreamingRef = useRef(isStreaming);
  const timerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Handle Error state
  useEffect(() => {
    if (hasError) {
      setActiveState('alert');
      setActiveExpr('colere');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setActiveState('idle');
        setActiveExpr(defaultExpression);
      }, 3500);
    }
  }, [hasError, defaultExpression]);

  // Handle Stream Start / Tool thinking / Stream End (Burst)
  useEffect(() => {
    if (hasError) return;

    if (isStreaming) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setIsBursting(false);

      setActiveState('thinking');
      setActiveExpr('attentif');
    } else {
      // Transition from streaming -> not streaming (Stream Complete)
      if (prevStreamingRef.current && !isStreaming) {
        setIsBursting(true);
        setActiveState('burst');
        setActiveExpr('heureux');

        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setIsBursting(false);
          setActiveState('idle');
          setActiveExpr(defaultExpression);
        }, 2400);
      } else if (!isBursting) {
        // Not streaming and not bursting
        if (isTyping) {
          setActiveState('idle');
          setActiveExpr('attentif');
        } else {
          setActiveState('idle');
          setActiveExpr(defaultExpression);
        }
      }
    }

    prevStreamingRef.current = isStreaming;
  }, [isStreaming, hasActiveTool, isTyping, hasError, isBursting, defaultExpression]);

  // Handle idle easter egg (occasional wink after long idle stretches)
  useEffect(() => {
    if (isStreaming || isTyping || hasError || isBursting || activeState !== 'idle') {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const scheduleEasterEgg = () => {
      const delayMs = 30000 + Math.random() * 30000; // 30-60s
      idleTimerRef.current = window.setTimeout(() => {
        if (!isStreaming && !isTyping && !hasError) {
          setActiveState('wink');
          timerRef.current = window.setTimeout(() => {
            setActiveState('idle');
            scheduleEasterEgg();
          }, 1800);
        }
      }, delayMs);
    };

    scheduleEasterEgg();

    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [isStreaming, isTyping, hasError, isBursting, activeState]);

  const followPointer = useMemo(() => {
    // Only follow cursor when at resting face without intense modal states
    return activeState === 'idle' || activeState === 'swirl';
  }, [activeState]);

  return {
    state: activeState,
    expression: activeExpr,
    shape: defaultShape,
    color: defaultColor,
    followPointer,
    isBursting,
  };
}
