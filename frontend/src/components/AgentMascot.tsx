import React, { useEffect, useRef, useState, useId, useMemo } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import {
  BotEngine,
  type BotFrame,
  type StateId,
  type ExpressionId,
  type ShapeId,
  type ColorId,
  SHAPE_BY_ID,
  COLOR_BY_ID,
  EXPRESSION_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  DEFAULT_EXPRESSION,
  STATE_BY_ID,
  RAYON,
  DEMI_VIEWBOX,
  NOTIF_BLUE,
  mixHex,
  lookTarget,
  TURN_TIME,
  clamp,
  easings,
} from '../lib/bloub-engine';

const mascotVariants = cva('inline-block shrink-0 transition-transform select-none', {
  variants: {
    size: {
      xs: 'w-6 h-6',
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12',
      xl: 'w-16 h-16',
      '2xl': 'w-24 h-24',
      '3xl': 'w-32 h-32',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
});

export interface AgentMascotProps extends VariantProps<typeof mascotVariants> {
  sizePx?: number;
  state?: StateId;
  expression?: ExpressionId;
  shape?: ShapeId;
  color?: ColorId | string;
  paper?: string;
  frozenAt?: number;
  follow?: boolean;
  targetRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  title?: string;
}

export const AgentMascot: React.FC<AgentMascotProps> = ({
  size,
  sizePx,
  state = 'idle',
  expression = DEFAULT_EXPRESSION,
  shape = DEFAULT_SHAPE,
  color = DEFAULT_COLOR,
  paper = '#F8FAFC',
  frozenAt,
  follow = false,
  targetRef,
  className,
  title = 'StudentOps AI Agent Mascot',
}) => {
  const rawId = useId().replace(/:/g, '');
  const uid = `mascot-${rawId}`;
  const maskId = `bot-mask-${uid}`;

  const svgRef = useRef<SVGSVGElement | null>(null);

  const shapeRadii = useMemo(() => SHAPE_BY_ID.get(shape)?.radii ?? null, [shape]);
  const ink = useMemo(() => {
    if (color.startsWith('#') || color.startsWith('rgb')) return color;
    return COLOR_BY_ID.get(color)?.hex ?? '#0F172A';
  }, [color]);
  const exprObj = useMemo(() => EXPRESSION_BY_ID.get(expression) ?? null, [expression]);

  // Master monotonic clock in seconds (managed continuously by the rAF loop)
  const clockRef = useRef(0);

  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(RAYON, state, shapeRadii, exprObj);
  }

  const [frame, setFrame] = useState<BotFrame>(() => {
    return engineRef.current!.sample(frozenAt ?? 0);
  });

  // Keep latest refs for rAF tick access without tearing down the loop
  const stateRef = useRef(state);
  stateRef.current = state;

  const followRef = useRef(follow);
  followRef.current = follow;

  const targetRefProp = useRef(targetRef);
  targetRefProp.current = targetRef;

  // Track state transitions synchronized to clockRef
  useEffect(() => {
    if (engineRef.current && engineRef.current.state !== state) {
      engineRef.current.setState(state, clockRef.current);
    }
  }, [state]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setShape(shapeRadii, clockRef.current);
    }
  }, [shapeRadii]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setExpression(exprObj, clockRef.current);
    }
  }, [exprObj]);

  // Pointer position for cursor following
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const aimingRef = useRef(false);
  const turnSinceRef = useRef(0);

  // Global pointer listeners for gaze tracking
  useEffect(() => {
    if (frozenAt !== undefined) return;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerLeave = () => {
      pointerRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      if (aimingRef.current && engineRef.current) {
        engineRef.current.setLook(null, clockRef.current, TURN_TIME);
        aimingRef.current = false;
      }
    };
  }, [frozenAt]);

  // Persistent animation loop
  useEffect(() => {
    if (frozenAt !== undefined) {
      // Frozen / static snapshot
      setFrame(engineRef.current!.sample(frozenAt));
      return;
    }

    let rafId: number;
    let lastMs = 0;

    const tick = (ms: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = lastMs ? Math.min((ms - lastMs) / 1000, 0.064) : 0;
      lastMs = ms;
      clockRef.current += dt;
      const clock = clockRef.current;
      const currentState = stateRef.current;

      // Handle Gaze Tracking
      if (followRef.current && STATE_BY_ID.get(currentState)?.baseFace) {
        const box = svgRef.current?.getBoundingClientRect();
        if (box && box.width > 0 && box.height > 0) {
          if (!aimingRef.current) {
            turnSinceRef.current = clock;
          }

          let targetX: number | null = null;
          let targetY: number | null = null;

          const currentTarget = targetRefProp.current?.current;
          if (currentTarget) {
            const targetBox = currentTarget.getBoundingClientRect();
            if (targetBox.width > 0 && targetBox.height > 0) {
              targetX = targetBox.left + targetBox.width / 2;
              targetY = targetBox.top + targetBox.height / 2;
            }
          } else if (pointerRef.current) {
            targetX = pointerRef.current.x;
            targetY = pointerRef.current.y;
          }

          if (targetX !== null && targetY !== null) {
            const demiLargeur = Math.max(1, window.innerWidth / 2);
            const demiHauteur = Math.max(1, window.innerHeight / 2);
            const nx = clamp((targetX - (box.left + box.width / 2)) / demiLargeur, -1, 1);
            const ny = clamp((targetY - (box.top + box.height / 2)) / demiHauteur, -1, 1);
            const tour = easings.easeOutQuint(clamp((clock - turnSinceRef.current) / TURN_TIME));

            engineRef.current!.setLook(
              lookTarget({ nx, ny, tour, pointer: true }),
              clock
            );
            aimingRef.current = true;
          } else if (aimingRef.current) {
            engineRef.current!.setLook(null, clock, TURN_TIME);
            aimingRef.current = false;
          }
        }
      } else if (aimingRef.current) {
        engineRef.current!.setLook(null, clock, TURN_TIME);
        aimingRef.current = false;
      }

      setFrame(engineRef.current!.sample(clock));
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [frozenAt]);

  const VB = DEMI_VIEWBOX;
  const R = RAYON;

  const dotAttrs = (dot: BotFrame['dots'][number]) => {
    const fill =
      dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
    const common = { fill, opacity: dot.opacity };
    return dot.d
      ? {
          ...common,
          d: dot.d,
          transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`,
        }
      : { ...common, cx: dot.x, cy: dot.y, r: dot.r };
  };

  const styleDimension = sizePx ? { width: sizePx, height: sizePx } : undefined;

  return (
    <div
      className={cn(mascotVariants({ size, className }))}
      style={styleDimension}
      title={title}
    >
      <svg
        ref={svgRef}
        className="w-full h-full overflow-visible"
        viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
        role="img"
        aria-label={title}
      >
        <defs>
          {/* Eye holes & notch cutout mask */}
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-VB}
            y={-VB}
            width={VB * 2}
            height={VB * 2}
          >
            <path d={frame.bodyPath} fill="#fff" />
            {frame.eyes.map((eye, i) => (
              <path
                key={i}
                d={eye.d}
                transform={eye.matrix}
                opacity={eye.alpha}
                fill="#000"
              />
            ))}
            {frame.notch && (
              <circle
                cx={frame.notch.x}
                cy={frame.notch.y}
                r={frame.notch.r}
                fill="#000"
              />
            )}
          </mask>

          {/* Gradients for 3D orbital rings */}
          {frame.arcs.map((arc) => (
            <linearGradient
              id={`${uid}-${arc.id}`}
              key={arc.id}
              gradientUnits="userSpaceOnUse"
              x1={arc.grad.x1}
              y1={arc.grad.y1}
              x2={arc.grad.x2}
              y2={arc.grad.y2}
            >
              {arc.grad.stops.map((c, i) => (
                <stop
                  key={i}
                  offset={i / (arc.grad.stops.length - 1)}
                  stopColor={c}
                />
              ))}
            </linearGradient>
          ))}
        </defs>

        {/* Back half of orbital rings (occluded behind body) */}
        <g fill="none" strokeLinecap="round">
          {frame.arcs.map((arc) => (
            <path
              key={`b${arc.id}`}
              d={arc.back}
              stroke={`url(#${uid}-${arc.id})`}
              strokeWidth={arc.width}
              opacity={arc.opacity}
            />
          ))}
        </g>

        {/* Burst particles passing behind core */}
        {frame.dotsBehind && (
          <g>
            {frame.dots.map((dot, i) =>
              dot.d ? (
                <path key={`pb${i}`} {...dotAttrs(dot)} />
              ) : (
                <circle key={`pb${i}`} {...dotAttrs(dot)} />
              )
            )}
          </g>
        )}

        {/* Body silhouette with opaque paper underlay & eye cutout mask */}
        <g opacity={frame.bodyAlpha}>
          <path d={frame.bodyPath} fill={paper} />
          <g mask={`url(#${maskId})`}>
            <rect
              x={-VB}
              y={-VB}
              width={VB * 2}
              height={VB * 2}
              fill={ink}
            />
          </g>
        </g>

        {/* Front particles */}
        {!frame.dotsBehind && (
          <g>
            {frame.dots.map((dot, i) =>
              dot.d ? (
                <path key={`pf${i}`} {...dotAttrs(dot)} />
              ) : (
                <circle key={`pf${i}`} {...dotAttrs(dot)} />
              )
            )}
          </g>
        )}

        {/* Notification indicator */}
        {frame.notif && (
          <circle
            cx={frame.notif.x}
            cy={frame.notif.y}
            r={frame.notif.r}
            fill={NOTIF_BLUE}
          />
        )}

        {/* Front half of orbital rings */}
        <g fill="none" strokeLinecap="round">
          {frame.arcs.map((arc) => (
            <path
              key={`f${arc.id}`}
              d={arc.front}
              stroke={`url(#${uid}-${arc.id})`}
              strokeWidth={arc.width}
              opacity={arc.opacity}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

AgentMascot.displayName = 'AgentMascot';
