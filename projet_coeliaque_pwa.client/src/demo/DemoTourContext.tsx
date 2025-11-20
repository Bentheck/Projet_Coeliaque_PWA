import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

export type DemoTourId = "calculator" | "grocery";

export interface DemoTourState {
    activeTour: DemoTourId | null;
    step: number;
}

interface DemoTourContextValue extends DemoTourState {
    startTour: (tour: DemoTourId, firstStep?: number) => void;
    nextStep: () => void;
    endTour: () => void;
}

const STORAGE_KEY = "sc-demo-tour-v1";

const DemoTourContext = createContext<DemoTourContextValue | undefined>(
    undefined
);

export const DemoTourProvider: React.FC<{ children: ReactNode }> = ({
    children,
}) => {
    const [activeTour, setActiveTour] = useState<DemoTourId | null>(null);
    const [step, setStep] = useState<number>(0);

    // load from localStorage (optional persistence)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as DemoTourState;
            if (
                parsed &&
                (parsed.activeTour === "calculator" ||
                    parsed.activeTour === "grocery")
            ) {
                setActiveTour(parsed.activeTour);
                setStep(parsed.step || 1);
            }
        } catch {
            /* ignore */
        }
    }, []);

    // persist
    useEffect(() => {
        try {
            if (!activeTour) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }
            const payload: DemoTourState = { activeTour, step };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* ignore */
        }
    }, [activeTour, step]);

    const startTour = (tour: DemoTourId, firstStep: number = 1) => {
        setActiveTour(tour);
        setStep(firstStep);
    };

    const nextStep = () => {
        if (!activeTour) return;
        setStep((prev) => prev + 1);
    };

    const endTour = () => {
        setActiveTour(null);
        setStep(0);
    };

    return (
        <DemoTourContext.Provider
            value={{ activeTour, step, startTour, nextStep, endTour }}
        >
            {children}
        </DemoTourContext.Provider>
    );
};

export function useDemoTour(): DemoTourContextValue {
    const ctx = useContext(DemoTourContext);
    if (!ctx) {
        throw new Error("useDemoTour must be used inside DemoTourProvider");
    }
    return ctx;
}
