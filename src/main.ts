/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    bufferWhen,
    combineLatest,
    concat,
    concatMap,
    concatWith,
    delay,
    delayWhen,
    EMPTY,
    endWith,
    from,
    fromEvent,
    groupBy,
    GroupedObservable,
    ignoreElements,
    interval,
    buffer,
    merge,
    mergeAll,
    mergeMap,
    Observable,
    of,
    startWith,
    takeUntil,
    takeWhile,
    tap,
    timer,
    toArray,
    withLatestFrom,
    Subject,
    switchMap,
} from "rxjs";
import { map, filter, scan } from "rxjs/operators";
import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";
import { RNG } from "./util.ts";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 200,
    CANVAS_HEIGHT: 400,
} as const;

const Constants = {
    TICK_UNIT_INCREMENT: 1,
    TICK_RATE_MS: 7,
    SONG_NAME: "RockinRobin",
    POSITION_THRESHOLD: 40,
    BOTTOM_ROW: 350,
    BONUS_NOTES_PERCENTAGE: 90,
} as const;

const Note = {
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,
    TAIL_WIDTH: 20,
};

/** User input */

type Key = "KeyH" | "KeyJ" | "KeyK" | "KeyL" | "Space";

type Event = "keydown" | "keyup" | "keypress";

type HTMLExistence = HTMLElement | null;
/** Utility functions */

/** State processing */

type State = Readonly<{
    gameEnd: boolean;
    allNotesProcessed: boolean;
    bonusActive: number;
    tickInterval: number;
    hash: number;
    noteCount: number;
    scoreGained: number;
    currentNotes: ReadonlyArray<Note>;
    RIPNotes: ReadonlyArray<Note>;
    playableNotes: ReadonlyArray<Note>;
}>;

const initialState: State = {
    gameEnd: false,
    allNotesProcessed: false,
    bonusActive: 0,
    tickInterval: 0,
    hash: RNG.hash(3847589), // Random seed
    noteCount: 0,
    scoreGained: 0,
    currentNotes: [],
    RIPNotes: [],
    playableNotes: [],
} as const;

// Column Enums
const Column = Object.freeze({
    GREEN: 0,
    RED: 1,
    BLUE: 2,
    YELLOW: 3,
});

type Tail = Readonly<{
    tailStart: number;
    tailEnd: number;
    dead: boolean;
}>;

type Note = Readonly<{
    id: number;
    special: boolean;
    visual: boolean;
    position: number;
    column: number;
    instrumentName: string;
    velocity: number;
    pitch: number;
    start: number;
    end: number;
    tail: Tail | undefined;
}>;

type DelayedNotes = Readonly<{
    delayIt: number;
    start: number | null;
    group: Note[];
}>;

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */

const tick = (s: State): State => {
    type TickSound = Readonly<[Note | null, Note | null]>;

    const updateNotePosition =
        (positionIncrement: number) =>
        (bottomRow: number) =>
        (note: Note): TickSound => {
            const newY = note.position + positionIncrement;
            const updateTail = (tail: Tail, visual: boolean): Tail => {
                const tailStart = tail.tailStart + positionIncrement;
                const tailEnd = visual
                    ? tail.tailEnd + positionIncrement
                    : bottomRow;
                const dead = visual ? false : tail.dead;
                return { tailStart, tailEnd, dead } as Tail;
            };

            if (note.tail) {
                const updatedTail: Tail = updateTail(
                    note.tail,
                    note.visual,
                ) as Tail;

                const updatedNote: Note = {
                    ...note,
                    position: newY,
                    tail: updatedTail,
                } as Note;

                if (note.visual) {
                    if (updatedTail.tailEnd === bottomRow) {
                        return (
                            updatedTail.tailStart < bottomRow
                                ? [
                                      {
                                          ...updatedNote,
                                          visual: false,
                                          tail: {
                                              ...updatedTail,
                                              dead: true,
                                          } as Tail,
                                      },
                                      null,
                                  ]
                                : [null, null]
                        ) as TickSound;
                    }
                    return (
                        updatedTail.tailStart < bottomRow
                            ? [updatedNote, null]
                            : [null, null]
                    ) as TickSound;
                } else {
                    if (newY === bottomRow) {
                        return [updatedNote, updatedNote] as TickSound;
                    }
                    return (
                        updatedTail.tailStart < bottomRow
                            ? [updatedNote, null]
                            : [null, null]
                    ) as TickSound;
                }
            } else if (newY <= bottomRow) {
                if (note.visual) {
                    if (newY < bottomRow) {
                        return [{ ...note, position: newY }, null] as TickSound;
                    } else if (newY === bottomRow) {
                        return [null, null] as TickSound;
                    }
                } else {
                    if (newY < bottomRow) {
                        return [{ ...note, position: newY }, null] as TickSound;
                    } else if (newY === bottomRow) {
                        return [null, { ...note, position: newY }] as TickSound;
                    }
                }
            }
            return [null, null] as TickSound;
        };

    const updatePositionForGame = updateNotePosition(
        Constants.TICK_UNIT_INCREMENT,
    )(Constants.BOTTOM_ROW);

    type AccNoteSound = Readonly<{
        newCurrentNotes: ReadonlyArray<Note>;
        newPlayableNotes: ReadonlyArray<Note>;
    }>;

    const initAccNoteSound: AccNoteSound = {
        newCurrentNotes: [],
        newPlayableNotes: [],
    };

    const { newCurrentNotes, newPlayableNotes }: AccNoteSound =
        s.currentNotes.reduce((acc: AccNoteSound, note: Note) => {
            const [updatedNote, playableNote] = updatePositionForGame(note);
            return {
                newCurrentNotes: updatedNote
                    ? [...acc.newCurrentNotes, updatedNote]
                    : acc.newCurrentNotes,
                newPlayableNotes: playableNote
                    ? [...acc.newPlayableNotes, playableNote]
                    : acc.newPlayableNotes,
            } as AccNoteSound;
        }, initAccNoteSound);

    const filterCheck = (note: Note): boolean =>
        note.position + 1 === Constants.BOTTOM_ROW && note.visual;

    const returnData: State = {
        ...s,
        gameEnd:
            s.allNotesProcessed &&
            newCurrentNotes.length === 0 &&
            newPlayableNotes.length === 0 &&
            s.RIPNotes.length === 0,

        currentNotes: newCurrentNotes,

        noteCount:
            newCurrentNotes.filter(filterCheck).length === 0
                ? s.noteCount
                : s.bonusActive,

        RIPNotes: [...s.currentNotes],

        playableNotes: newPlayableNotes,
    };
    return returnData;
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
    elem.setAttribute("visibility", "visible");
    elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
    elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
) => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

/** Sets of classes for button actions */
interface Action {
    apply(s: State): State;
}

// Pure implementation
class ButtonRelease implements Action {
    constructor(public readonly column: number) {}
    apply(s: State): State {
        const scoreGainedModified: number = s.currentNotes.reduce(
            (acc, note: Note) => {
                if (
                    note.tail !== undefined &&
                    note.column === this.column &&
                    !note.visual &&
                    !note.tail.dead
                ) {
                    acc -= 1 + 0.2 * Math.floor(s.noteCount / 10);
                }
                return acc;
            },
            s.scoreGained,
        );

        const noteCountModification = s.currentNotes.reduce(
            (acc, note: Note) => {
                if (
                    note.tail !== undefined &&
                    note.column === this.column &&
                    !note.visual &&
                    !note.tail.dead
                ) {
                    acc = s.bonusActive;
                }
                return acc;
            },
            s.noteCount,
        );

        const currentNotes: Note[] = s.currentNotes.map((note) => {
            if (
                note.tail !== undefined &&
                note.column === this.column &&
                !note.visual &&
                !note.tail.dead
            ) {
                return {
                    ...note,
                    tail: { ...note.tail, dead: true } as Tail,
                } as Note;
            }
            return note;
        });

        return {
            ...s,
            currentNotes: currentNotes,
            noteCount: noteCountModification,
            scoreGained: ~~scoreGainedModified,
            RIPNotes: [...s.currentNotes],
        } as State;
    }
}
// Pure implementation
class ButtonClick implements Action {
    constructor(public readonly column: number) {}
    apply(s: State): State {
        type Accumulator = Readonly<{
            triggered: boolean;
            scoreGained: number;
            notePressed: number;
            specialGained: number;
        }>;

        const initialAcc: Accumulator = {
            triggered: false,
            scoreGained: s.scoreGained,
            notePressed: s.noteCount,
            specialGained: s.bonusActive,
        };

        const triggered: Accumulator = s.currentNotes.reduce(
            (acc: Accumulator, note: Note) => {
                if (
                    note.position >=
                        Constants.BOTTOM_ROW - Constants.POSITION_THRESHOLD &&
                    note.position < Constants.BOTTOM_ROW &&
                    note.column === this.column &&
                    note.visual
                ) {
                    if (note.special) {
                        return {
                            ...acc,
                            triggered: true,
                            specialGained: acc.specialGained + 100,
                            notePressed: acc.notePressed + 100,
                        };
                    } else {
                        return {
                            ...acc,
                            triggered: true,
                            notePressed: acc.notePressed + 1,
                            scoreGained:
                                acc.scoreGained +
                                (1 + 0.2 * ~~(acc.notePressed / 10)),
                        };
                    }
                }
                return acc;
            },
            initialAcc,
        );

        // Process notes and update their visual status if triggered
        const currentNotes: Note[] = s.currentNotes.map((note) => {
            if (
                note.position >=
                    Constants.BOTTOM_ROW - Constants.POSITION_THRESHOLD &&
                note.position < Constants.BOTTOM_ROW &&
                note.column === this.column &&
                note.visual
            ) {
                return { ...note, visual: false } as Note;
            }
            return note;
        });

        // Wrong button press, make random notes
        // Ensure no already tail note is being played when we hold the button for rapid playing in current column
        const instrumentList: ReadonlyArray<string> = [
            "piano",
            "violin",
            "flute",
            "saxophone",
            "trumpet",
            "bass-electric",
        ] as ReadonlyArray<string>;

        const wrongNote: Note = {
            instrumentName:
                instrumentList[~~(RNG.scale(s.hash) * instrumentList.length)],
            velocity: ~~(RNG.scale(s.hash) * 90), // you can change 90  to 128, the sound is just too loud
            pitch: ~~(RNG.scale(s.hash) * 70),
            start: 0.0,
            end: ~~(RNG.scale(s.hash) * 500),
        } as Note;

        const checkWrongPress: boolean =
            !triggered.triggered &&
            currentNotes.filter(
                (note: Note) =>
                    note.column === this.column &&
                    !note.visual &&
                    note.tail !== undefined,
            ).length === 0;

        return {
            ...s,
            bonusActive: triggered.specialGained,
            currentNotes: currentNotes,
            noteCount: checkWrongPress ? s.bonusActive : triggered.notePressed,
            hash: RNG.hash(s.hash),
            RIPNotes: [...s.currentNotes],
            scoreGained: ~~triggered.scoreGained,
            playableNotes: checkWrongPress
                ? s.playableNotes.concat(wrongNote)
                : s.playableNotes,
        } as State;
    }
}

/** Ticking The main game engine */
// Pure implementation
class TickGame implements Action {
    apply(s: State): State {
        const bonusFlag: boolean =
            s.bonusActive > 0 &&
            s.tickInterval !== 0 &&
            s.tickInterval % ~~(2000 / Constants.TICK_RATE_MS) === 0;

        const updatedStat: State = tick(s);
        return {
            ...updatedStat,
            // remove the bonusActive every 2 seconds
            tickInterval:
                s.bonusActive > 0 &&
                (s.tickInterval === 0 ||
                    s.tickInterval % ~~(2000 / Constants.TICK_RATE_MS) !== 0)
                    ? s.tickInterval + 1
                    : 0,
            bonusActive: bonusFlag ? s.bonusActive - 50 : s.bonusActive,
            noteCount: bonusFlag
                ? updatedStat.noteCount - 50
                : updatedStat.noteCount,
        } as State;
    }
}
// Pure implementation
class GameEnd implements Action {
    apply(s: State): State {
        return tick({ ...s, allNotesProcessed: true });
    }
}
// Pure implementation
class NextNote implements Action {
    constructor(public readonly currentNotes: Note[]) {}
    apply(s: State): State {
        const notesWithTail = this.currentNotes.map((note: Note) => {
            const duration = note.end - note.start;
            if (note.visual && duration > 1000) {
                const tailLength = duration / Constants.TICK_RATE_MS; // Calculate tail length based on duration
                return {
                    ...note,
                    tail: {
                        tailStart: note.position - tailLength,
                        tailEnd: note.position,
                    } as Tail,
                } as Note;
            } else {
                return {
                    ...note,
                    // Special note takes 90% chance to appear
                    special:
                        ~~(RNG.scale(s.hash) * 100) >=
                        Constants.BONUS_NOTES_PERCENTAGE,
                    tail: undefined,
                } as Note;
            }
        });
        return tick({
            ...s,
            hash: RNG.hash(s.hash),
            currentNotes: s.currentNotes.concat(notesWithTail),
        });
    }
}
// Pure implementation
class RandomiseNotes implements Action {
    apply(s: State): State {
        return {
            ...s,
            hash: RNG.hash(s.hash),
            currentNotes: s.currentNotes.map((note: Note, idx: number) => {
                if (note.visual) {
                    return {
                        ...note,
                        column: ~~(RNG.scale(RNG.hash(s.hash + idx)) * 4),
                    } as Note;
                }
                return {
                    ...note,
                } as Note;
            }),
        } as State;
    }
}
// Pure implementation
function showKeys() {
    function showKey(k: Key) {
        const arrowKey = document.getElementById(k);
        // getElement might be null, in this case return without doing anything
        if (!arrowKey) return;

        const keydown$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
            filter(({ code }) => code === k),
        );

        const keyup$ = fromEvent<KeyboardEvent>(document, "keyup").pipe(
            filter(({ code }) => code === k),
        );

        keydown$.subscribe(() => arrowKey.classList.add("highlight"));
        keyup$.subscribe(() => arrowKey.classList.remove("highlight"));
    }
    showKey("KeyH");
    showKey("KeyL");
    showKey("KeyJ");
    showKey("KeyK");
    showKey("Space");
}

// Impure function used in subscribe
const playNotes = (s: State, samples: { [key: string]: Tone.Sampler }) => {
    if (s.playableNotes.length > 0) {
        s.playableNotes.forEach((note: Note) => {
            if (note.tail !== undefined) {
                samples[note.instrumentName].triggerAttack(
                    Tone.Frequency(note.pitch, "midi").toNote(), // Convert MIDI note to frequency
                    undefined, // Use default time for note onset
                    note.velocity / 127, // Set velocity to quarter of the maximum velocity
                );

                setTimeout(() => {
                    samples[note.instrumentName].triggerRelease(
                        Tone.Frequency(note.pitch, "midi").toNote(), // Convert MIDI note to frequency
                    );
                }, note.end - note.start);
            } else {
                samples[note.instrumentName].triggerAttackRelease(
                    Tone.Frequency(note.pitch, "midi").toNote(), // Convert MIDI note to frequency
                    (note.end - note.start) / 1000, // Duration of the note in seconds
                    undefined, // Use default time for note onset
                    note.velocity / 127,
                );
            }
        });
    }
};

// Impure function used in subscribe
const suppressNotes = (s: State, samples: { [key: string]: Tone.Sampler }) => {
    s.currentNotes
        .filter(
            (note: Note) =>
                !note.visual && note.tail !== undefined && note.tail.dead,
        )
        .forEach((note: Note) => {
            samples[note.instrumentName].triggerRelease(
                Tone.Frequency(note.pitch, "midi").toNote(), // Convert MIDI note to frequency
            );
        });
};

// Impure function used in subscribe
function createRealisticDonutCircle(
    svgNamespaceURI: string | null,
    note: Note,
    svg: SVGGraphicsElement & HTMLElement,
    tail: boolean,
) {
    // Outer circle with radial gradient and shadow
    const outerCircle = createSvgElement(svgNamespaceURI, "circle", {
        id: String(note.id),
        r: `${Note.RADIUS}`,
        cx: `${(note.column + 1) * 20}%`,
        cy: String(tail ? 350 : note.position),
        style: `fill: url(#${
            tail && note.tail!.dead
                ? "grey"
                : ["green", "red", "blue", "yellow"][note.column]
        }Gradient);`,
    });

    // Inner circle (to create the donut hole)
    const innerCircle = createSvgElement(svgNamespaceURI, "circle", {
        id: `${String(note.id)}-effect`,
        r: `${Note.RADIUS / 2}`,
        cx: `${(note.column + 1) * 20}%`,
        cy: String(tail ? 350 : note.position),
        fill: "black",
    });

    // Gloss effect (ellipse) with transparency and blur for more realism
    const glossEffect = createSvgElement(svgNamespaceURI, "ellipse", {
        id: `${String(note.id)}-gloss`,
        cx: `${(note.column + 1) * 20}%`,
        cy: `${(tail ? 350 : note.position) - Note.RADIUS / 3}`,
        rx: `5%`,
        ry: `2%`,
        style: `fill: url(#glossGradient);`,
    });

    // Append the elements to the SVG in the correct order
    svg.appendChild(outerCircle);
    svg.appendChild(innerCircle);
    svg.appendChild(glossEffect);
}

/**
 * \y.(\x.y)x
 *
 * */

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main(
    csvContents: string,
    samples: { [key: string]: Tone.Sampler },
    hardVersion: boolean = false,
) {
    // Canvas elements

    const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
        HTMLElement;
    const preview = document.querySelector(
        "#svgPreview",
    ) as SVGGraphicsElement & HTMLElement;

    const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
        HTMLElement;

    const container = document.querySelector("#main") as HTMLElement;

    const highScoreText = document.querySelector(
        "#highScoreText",
    ) as HTMLElement;

    const highScore = localStorage.getItem("highScore");
    highScoreText.textContent =
        highScore !== null ? String(parseInt(highScore, 10)) : String(0);

    svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
    svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);

    // Text fields
    const multiplier = document.querySelector("#multiplierText") as HTMLElement,
        scoreText = document.querySelector("#scoreText") as HTMLElement,
        bonusText = document.querySelector("#bonusMultiplier") as HTMLElement,
        decayTime = document.querySelector("#decayTime") as HTMLElement,
        /** User input */
        fromKeyDown$ = (keyCode: Key) =>
            fromEvent<KeyboardEvent>(document, "keydown").pipe(
                filter(({ code }) => code === keyCode),
            ),
        fromKeyUp$ = (keyCode: Key) =>
            fromEvent<KeyboardEvent>(document, "keyup").pipe(
                filter(({ code }) => code === keyCode),
            ),
        filterWhenNotPaused =
            <T>(pauseKey$: Observable<boolean>) =>
            (source$: Observable<T>) =>
                source$.pipe(
                    withLatestFrom(pauseKey$),
                    filter(([_, isPaused]) => !isPaused),
                ),
        colourSelector: (pitch: number) => number = (pitch) => pitch % 4,
        /** Helper Methods to get the elements and map them to correct groups from csv file */
        parseCSV$ = (csvContents: string): Observable<Note> =>
            from(csvContents.split("\n")).pipe(
                map((item: string) => item.split(",")),
                filter(
                    (strLst: string[]) =>
                        strLst[0] === "True" || strLst[0] === "False",
                ),
                scan(
                    (acc: Note, parts: string[]) =>
                        ({
                            id: acc.id + 1,
                            column: colourSelector(parseInt(parts[3])),
                            position: 0,
                            visual: parts[0] === "True",
                            instrumentName: parts[1],
                            velocity: parseInt(parts[2]),
                            pitch: parseInt(parts[3]),
                            start: parseFloat(parts[4]) * 1000, // Convert start from seconds to milliseconds
                            end: parseFloat(parts[5]) * 1000,
                        }) as Note,
                    {
                        id: 0,
                    } as Note,
                ),
            ),
        scheduleVisualNotes$ = (
            notes$: Observable<Note>,
        ): Observable<Note[]> => {
            return notes$.pipe(
                groupBy((note: Note) => note.start),
                mergeMap((group$: GroupedObservable<number, Note>) =>
                    group$.pipe(toArray()),
                ),
            );
        },
        pauseKey$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
            filter((event) => event.code === "Space"),
            scan((isPaused) => !isPaused, false),
            startWith(false),
        ),
        parseCSV = (csvContents: string): Note[] =>
            csvContents
                .split("\n")
                .map((item: string): string[] => item.split(","))
                .filter(
                    (parts: string[]): boolean =>
                        parts[0] === "True" || parts[0] === "False",
                )
                .reduce(
                    (acc: Note[], parts: string[]): Note[] => [
                        ...acc,
                        {
                            id: acc.length + 1,
                            column: colourSelector(parseInt(parts[3])),
                            position: 0,
                            visual: parts[0] === "True",
                            instrumentName: parts[1],
                            velocity: parseInt(parts[2]),
                            pitch: parseInt(parts[3]),
                            start: parseFloat(parts[4]) * 1000, // Convert start from seconds to milliseconds
                            end: parseFloat(parts[5]) * 1000,
                        } as Note,
                    ],
                    [],
                ),
        scheduleVisualNotes = (notes: Note[]): Note[][] =>
            Object.values(
                notes.reduce(
                    (
                        groups: Record<number, Note[]>,
                        note: Note,
                    ): Record<number, Note[]> => {
                        const startTime = note.start;
                        return {
                            ...groups,
                            [startTime]: [...(groups[startTime] || []), note],
                        };
                    },
                    {},
                ),
            ),
        // HOF, curried function - (used to adjust the initial start time)
        delayedGroupNotes$ =
            (notes$: Observable<Note[]>) =>
            (initialStart: number | null = null) =>
                notes$.pipe(
                    scan(
                        (store: DelayedNotes, currentNote: Note[]) => {
                            return {
                                start: currentNote[0].start,
                                delayIt:
                                    store.start === null
                                        ? 0
                                        : currentNote[0].start - store.start,
                                group: currentNote,
                            } as DelayedNotes;
                        },
                        {
                            start: initialStart,
                            delayIt: 0,
                            group: [],
                        } as DelayedNotes,
                    ),
                    concatMap((delayedNotes: DelayedNotes) =>
                        of(delayedNotes).pipe(
                            delay(delayedNotes.delayIt), // Emit after applying the delay
                        ),
                    ),
                ),
        /**
         * Renders the current state to the canvas.s
         *
         * In MVC terms, this updates the View using the Model.
         *
         * @param s Current state
         */

        removeNotes = (s: State) => {
            s.RIPNotes.forEach((o: Note) => {
                const v = document.getElementById(String(o.id));
                if (v) svg.removeChild(v);

                const vInner = document.getElementById(
                    `${String(o.id)}-effect`,
                );
                if (vInner) svg.removeChild(vInner);

                const vGloss = document.getElementById(`${String(o.id)}-gloss`);
                if (vGloss) svg.removeChild(vGloss);

                const tailV = document.getElementById(String(o.id) + "-tail");
                if (tailV) svg.removeChild(tailV);

                const bonusNote = document.getElementById(
                    String(o.id) + "-starElementId",
                );
                if (bonusNote) svg.removeChild(bonusNote);
            });
        },
        /** Rendering (side effects) */
        render = (s: State) => {
            removeNotes(s);

            s.currentNotes.forEach((note: Note) => {
                if (note.visual) {
                    // Notes not played by user with tail
                    if (note.tail !== undefined) {
                        const tailElementId = `${String(note.id)}-tail`;
                        svg.appendChild(
                            createSvgElement(svg.namespaceURI, "rect", {
                                id: tailElementId,
                                x: `${(note.column + 1) * 20 - 5}%`, // Position based on the index
                                y: String(note.tail.tailStart), // Y position based on tailStart
                                width: `${Note.TAIL_WIDTH}`,
                                height: `${note.tail.tailEnd - note.tail.tailStart}`, // Height based on the tail length
                                rx: "10", // Adjust the value for the desired corner rounding (horizontal radius)
                                ry: "10",
                                style: `fill: url(#${["green", "red", "blue", "yellow"][note.column]}Gradient); stroke: none;`,
                                class: "shadow",
                            }),
                        );
                    }

                    // Normal visual notes
                    if (note.special) {
                        svg.appendChild(
                            createSvgElement(svg.namespaceURI, "polygon", {
                                points: "150,345 156,360 174,360 162,372 166,390 150,380 134,390 138,372 126,360 144,360",
                                fill: "url(#realisticStarGradient)", // Use your gradient for a realistic effect
                                filter: "url(#circleShadow)", // Apply the shadow for depth
                                transform: `translate(${["-110", "-70", "-30", "10"][note.column]}, ${String(-370 + note.position)})`, // Optional: Move the star by 10 units right and 5 units down
                                id: `${String(note.id)}-starElementId`, // Optional: Assign an ID to the star for easier manipulation later
                            }),
                        );
                    } else {
                        createRealisticDonutCircle(
                            svg.namespaceURI,
                            note,
                            svg,
                            false,
                        );
                    }
                }
                // Notes played by user with tail
                else if (note.tail !== undefined) {
                    const tailElementId = `${String(note.id)}-tail`;
                    svg.appendChild(
                        createSvgElement(svg.namespaceURI, "rect", {
                            id: tailElementId,
                            x: `${(note.column + 1) * 20 - 5}%`, // Position based on the index
                            y: String(note.tail.tailStart), // Y position based on tailStart
                            width: `${Note.TAIL_WIDTH}`,
                            height: `${note.tail.tailEnd - note.tail.tailStart}`, // Height based on the tail length
                            rx: "10", // Adjust the value for the desired corner rounding (horizontal radius)
                            ry: "10",
                            style: note.tail.dead
                                ? "fill: url(#greyGradient); stroke: none;"
                                : `fill: url(#${["green", "red", "blue", "yellow"][note.column]}Gradient); stroke: none;`,
                            class: "shadow",
                        }),
                    );

                    createRealisticDonutCircle(
                        svg.namespaceURI,
                        note,
                        svg,
                        true,
                    );
                }
            });
            scoreText.textContent = String(s.scoreGained);
            const currentHighScore = parseInt(
                highScore !== null
                    ? String(parseInt(highScore, 10))
                    : String(0),
            );
            const check = s.currentNotes.filter(
                (note: Note) => !note.visual && note.tail !== undefined,
            );
            if (s.scoreGained > currentHighScore && check.length === 0) {
                localStorage.setItem("highScore", String(s.scoreGained));
                highScoreText.textContent = String(s.scoreGained);
            }
            multiplier.textContent = String(
                1 + 0.2 * ~~(s.noteCount / 10) + "x",
            );
            bonusText.textContent = String(
                1 + 0.2 * ~~(s.bonusActive / 10) + "x",
            );
            decayTime.textContent =
                s.bonusActive > 0
                    ? `${(((2000 / Constants.TICK_RATE_MS - s.tickInterval) * Constants.TICK_RATE_MS) / 1000).toFixed(1)}s`
                    : "0s";
        },
        /**
         * Extracting the notes from the csv data file.
         * */

        // notes: Note[] = parseCSV(csvContents),
        // scheduledNotes$ :Observable<Note[]>= from(scheduleVisualNotes(notes)),

        notes$ = parseCSV$(csvContents),
        scheduledNotes$ = scheduleVisualNotes$(notes$),
        groupedDelayedNotes$ = delayedGroupNotes$(scheduledNotes$)(null), // put 0 for delaying the start time based on the first not start
        /*=================================================================================*/

        releaseH$ = fromKeyUp$("KeyH").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonRelease(Column.GREEN)),
        ),
        releaseJ$ = fromKeyUp$("KeyJ").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonRelease(Column.RED)),
        ),
        releaseK$ = fromKeyUp$("KeyK").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonRelease(Column.BLUE)),
        ),
        releaseL$ = fromKeyUp$("KeyL").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonRelease(Column.YELLOW)),
        ),
        tick$ = interval(Constants.TICK_RATE_MS).pipe(
            filterWhenNotPaused(pauseKey$),
            map(() => new TickGame()),
        ),
        nextNote$ = groupedDelayedNotes$.pipe(
            filterWhenNotPaused(pauseKey$),
            map(([notes, _]) => new NextNote(notes.group)),
            endWith(new GameEnd()),
        ),
        randomiseNotes$ = hardVersion
            ? interval(2000).pipe(
                  filterWhenNotPaused(pauseKey$),
                  map(() => new RandomiseNotes()),
              )
            : EMPTY,
        pressH$ = fromKeyDown$("KeyH").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonClick(Column.GREEN)),
        ),
        pressJ$ = fromKeyDown$("KeyJ").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonClick(Column.RED)),
        ),
        pressK$ = fromKeyDown$("KeyK").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonClick(Column.BLUE)),
        ),
        pressL$ = fromKeyDown$("KeyL").pipe(
            filterWhenNotPaused(pauseKey$),
            map((_) => new ButtonClick(Column.YELLOW)),
        );
    /*=================================================================================*/

    const applyAction = (s: State, action: Action) => action.apply(s);
    const gameEngine$ = merge(
        pressH$,
        pressJ$,
        pressK$,
        pressL$, // Pressing the buttons - Designed for both normal notes and the tails
        releaseH$,
        releaseJ$,
        releaseK$,
        releaseL$, // Releasing the buttons - Designed for mostly for the tails
        nextNote$,
        tick$, // Main game ticking and incoming notes generation
        randomiseNotes$, // Advance version - extension
    );

    const state$: Observable<State> = gameEngine$.pipe(
        scan(applyAction, initialState),
    );

    const restartPress: Observable<MouseEvent> = fromEvent<MouseEvent>(
        document.getElementById("restartButton")!,
        "mousedown",
    );

    const restartSubscription = (s: State) =>
        restartPress.subscribe(() => {
            subscription.unsubscribe();
            removeNotes(s);
            multiplier.textContent = "1x";
            bonusText.textContent = "1x";
            decayTime.textContent = "0s";
            scoreText.textContent = "0";
            hide(gameover);
        });

    const subscription = state$.subscribe((s: State) => {
        render(s);
        playNotes(s, samples);
        suppressNotes(s, samples);

        restartSubscription(s);

        if (s.gameEnd) {
            show(gameover);
            subscription.unsubscribe();
        } else {
            hide(gameover);
        }
    });
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: [
            "bass-electric",
            "violin",
            "piano",
            "trumpet",
            "saxophone",
            "trombone",
            "flute",
        ], // SampleLibrary.list,
        baseUrl: "samples/",
    });

    const fileInputElement: HTMLInputElement | null = document.getElementById(
        "csvFileInput",
    ) as HTMLInputElement | null;
    const startButtonElement: HTMLExistence = document.getElementById(
        "startButton",
    ) as HTMLElement | null;
    const restartButton = document.getElementById("restartButton")!;
    const statusElement = document.getElementById("loading-status-text");
    const stopButton = document.getElementById("stopButton");
    const resumeButton = document.getElementById("resumeButton");

    //this is part of stop and resume type

    stopButton.addEventListener("click", function () {
        // Hide the Stop button
        stopButton.style.display = "none";
        // Show the Resume button
        resumeButton.style.display = "inline-block";
    });

    // Event listener for Resume button
    resumeButton.addEventListener("click", function () {
        // Hide the Resume button
        resumeButton.style.display = "none";
        // Show the Stop button
        stopButton.style.display = "inline-block";
    });

    const startGame = (contents: string) => {
        showKeys();
        statusElement!.textContent = "Loaded Successfully!";
        statusElement!.classList.remove("removeLight");
        statusElement!.classList.add("highlight");

        if (fileInputElement && startButtonElement) {
            const csvFileLoad$: Observable<File | null> = fromEvent<Event>(
                fileInputElement,
                "change",
            ).pipe(
                filter(
                    (_) =>
                        fileInputElement.files !== null &&
                        fileInputElement.files.length > 0,
                ),
                map((_) => fileInputElement.files![0]),
                startWith(null),
            );

            const startButtonClick$: Observable<MouseEvent> =
                fromEvent<MouseEvent>(startButtonElement, "mousedown");

            // This would ensure the latest file is loaded along with the start button single emission
            const startOperation$ = startButtonClick$.pipe(
                withLatestFrom(csvFileLoad$),
            );

            startOperation$.subscribe(([_, file]) => {
                const selectedDifficulty: Element | null =
                    document.querySelector('input[name="difficulty"]:checked');
                const statusElement: HTMLExistence = document.getElementById(
                    "loading-status-text",
                );

                if (statusElement) {
                    statusElement.textContent = "Loaded Successfully!";
                    statusElement.classList.remove("removeLight");
                    statusElement.classList.add("highlight");
                }

                if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const csvContent = reader.result as string;

                        if (selectedDifficulty) {
                            main(csvContent, samples, true);
                        } else {
                            main(csvContent, samples);
                        }
                    };
                    reader.onerror = () => {
                        console.error("Error reading the file");
                        if (selectedDifficulty) {
                            main(contents, samples, true);
                        } else {
                            main(contents, samples);
                        }
                    };
                    reader.readAsText(file);
                } else {
                    // Use default or predefined content
                    if (selectedDifficulty) {
                        main(contents, samples, true);
                    } else {
                        main(contents, samples);
                    }
                }
                // Disable further file input to prevent loading new files after the game starts
                startButtonElement.setAttribute("disabled", "disabled");
                // restartButton.setAttribute("disabled", "disabled")
                fileInputElement.setAttribute("disabled", "disabled");
            });
        } else {
            console.error("File input or start button element not found");
        }
    };

    const prepareRestart = () => {
        // Reset UI components
        const statusElement = document.getElementById("loading-status-text")!;
        statusElement.textContent = "Ready to start!";

        const fileInputElement = document.getElementById("csvFileInput")!;
        fileInputElement.removeAttribute("disabled");

        const startButtonElement = document.getElementById("startButton")!;
        startButtonElement.removeAttribute("disabled");
    };

    const restartButtonClick$ = fromEvent(restartButton, "click");
    restartButtonClick$.subscribe(() => {
        if (!restartButton.getAttribute("disabled")) {
            prepareRestart();
        }
    });

    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        fetch(`${baseUrl}/assets/${Constants.SONG_NAME}.csv`)
            .then((response) => response.text())
            .then((text) => startGame(text))
            .catch((error) =>
                console.error("Error fetching the CSV file:", error),
            );
    });
}
