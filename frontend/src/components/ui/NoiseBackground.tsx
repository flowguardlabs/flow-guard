import React from 'react';

interface NoiseBackgroundProps {
    className?: string;
    opacity?: number;
}

export function NoiseBackground({ className = '', opacity = 0.15 }: NoiseBackgroundProps) {
    return (
        <div
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                opacity,
            }}
            className={`absolute inset-0 z-0 pointer-events-none mix-blend-multiply ${className}`}
        />
    );
}
