// ─── Cozy Hall · the one icon set ───────────────────────────────────────────
// Every symbol in the hall is a Phosphor *bold* outline, chosen here by
// meaning — "voice" is the same microphone on every button, panel and toast.
// Emoji are reserved for emotes (EMOTES) and nothing else.
// Per-icon deep imports keep the bundle to exactly the icons listed below.

import type { IconProps } from "@phosphor-icons/react";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { Car } from "@phosphor-icons/react/dist/csr/Car";
import { Chair } from "@phosphor-icons/react/dist/csr/Chair";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Cloud } from "@phosphor-icons/react/dist/csr/Cloud";
import { CloudSlash } from "@phosphor-icons/react/dist/csr/CloudSlash";
import { Confetti } from "@phosphor-icons/react/dist/csr/Confetti";
import { CornersIn } from "@phosphor-icons/react/dist/csr/CornersIn";
import { CornersOut } from "@phosphor-icons/react/dist/csr/CornersOut";
import { Couch } from "@phosphor-icons/react/dist/csr/Couch";
import { Crown } from "@phosphor-icons/react/dist/csr/Crown";
import { DeviceRotate } from "@phosphor-icons/react/dist/csr/DeviceRotate";
import { DiceFive } from "@phosphor-icons/react/dist/csr/DiceFive";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Export } from "@phosphor-icons/react/dist/csr/Export";
import { Eye } from "@phosphor-icons/react/dist/csr/Eye";
import { FilmSlate } from "@phosphor-icons/react/dist/csr/FilmSlate";
import { FloppyDisk } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { HandFist } from "@phosphor-icons/react/dist/csr/HandFist";
import { HandPalm } from "@phosphor-icons/react/dist/csr/HandPalm";
import { HandPeace } from "@phosphor-icons/react/dist/csr/HandPeace";
import { HandPointing } from "@phosphor-icons/react/dist/csr/HandPointing";
import { HandsClapping } from "@phosphor-icons/react/dist/csr/HandsClapping";
import { HandTap } from "@phosphor-icons/react/dist/csr/HandTap";
import { HandWaving } from "@phosphor-icons/react/dist/csr/HandWaving";
import { Headphones } from "@phosphor-icons/react/dist/csr/Headphones";
import { HourglassHigh } from "@phosphor-icons/react/dist/csr/HourglassHigh";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Image as ImageGlyph } from "@phosphor-icons/react/dist/csr/Image";
import { Info } from "@phosphor-icons/react/dist/csr/Info";
import { Joystick } from "@phosphor-icons/react/dist/csr/Joystick";
import { Lightning } from "@phosphor-icons/react/dist/csr/Lightning";
import { LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { LockKey } from "@phosphor-icons/react/dist/csr/LockKey";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import { Medal } from "@phosphor-icons/react/dist/csr/Medal";
import { Microphone } from "@phosphor-icons/react/dist/csr/Microphone";
import { MicrophoneSlash } from "@phosphor-icons/react/dist/csr/MicrophoneSlash";
import { Moon } from "@phosphor-icons/react/dist/csr/Moon";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Popcorn } from "@phosphor-icons/react/dist/csr/Popcorn";
import { Robot } from "@phosphor-icons/react/dist/csr/Robot";
import { Scroll } from "@phosphor-icons/react/dist/csr/Scroll";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { Siren } from "@phosphor-icons/react/dist/csr/Siren";
import { SkipBack } from "@phosphor-icons/react/dist/csr/SkipBack";
import { SkipForward } from "@phosphor-icons/react/dist/csr/SkipForward";
import { Smiley } from "@phosphor-icons/react/dist/csr/Smiley";
import { SoccerBall } from "@phosphor-icons/react/dist/csr/SoccerBall";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { SpeakerHigh } from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import { Star } from "@phosphor-icons/react/dist/csr/Star";
import { Target } from "@phosphor-icons/react/dist/csr/Target";
import { Television } from "@phosphor-icons/react/dist/csr/Television";
import { Timer } from "@phosphor-icons/react/dist/csr/Timer";
import { Trophy } from "@phosphor-icons/react/dist/csr/Trophy";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { User } from "@phosphor-icons/react/dist/csr/User";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import { Volleyball } from "@phosphor-icons/react/dist/csr/Volleyball";
import { Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { Waveform } from "@phosphor-icons/react/dist/csr/Waveform";
import { Wrench } from "@phosphor-icons/react/dist/csr/Wrench";
import { X } from "@phosphor-icons/react/dist/csr/X";

const ICONS = {
  // contextual actions (ACT / E)
  sit: Chair,
  sofa: Couch,
  toss: SoccerBall,
  dodge: Volleyball,
  drive: Car,
  view: Eye,
  addLink: LinkSimple,
  duel: HandFist,
  starGame: Star,
  sos: Siren,
  // social
  react: Smiley,
  poke: HandPointing,
  highFive: HandsClapping,
  wave: HandWaving,
  // hall features
  tv: Television,
  rps: HandFist,
  voice: Microphone,
  voiceOff: MicrophoneSlash,
  speaking: Waveform,
  headphones: Headphones,
  chat: ChatCircleDots,
  // rock · paper · scissors
  rock: HandFist,
  paper: HandPalm,
  scissors: HandPeace,
  // media
  play: Play,
  pause: Pause,
  previous: SkipBack,
  next: SkipForward,
  sound: SpeakerHigh,
  video: FilmSlate,
  // results & moments
  trophy: Trophy,
  crown: Crown,
  target: Target,
  shield: ShieldCheck,
  hourglass: HourglassHigh,
  medal: Medal,
  confetti: Confetti,
  dice: DiceFive,
  popcorn: Popcorn,
  timer: Timer,
  again: ArrowClockwise,
  bonk: Lightning,
  sparkle: Sparkle,
  moon: Moon,
  // chrome
  menu: DotsThree,
  close: X,
  back: CaretLeft,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  check: Check,
  plus: Plus,
  fullscreen: CornersOut,
  exitFullscreen: CornersIn,
  signOut: SignOut,
  home: House,
  bot: Robot,
  users: Users,
  user: User,
  caretUp: CaretUp,
  caretDown: CaretDown,
  caretLeft: CaretLeft,
  caretRight: CaretRight,
  // mobile guidance
  rotate: DeviceRotate,
  joystick: Joystick,
  tap: HandTap,
  zoom: MagnifyingGlassPlus,
  share: Export,
  // status
  warning: Warning,
  info: Info,
  lock: LockKey,
  offline: CloudSlash,
  cloud: Cloud,
  disk: FloppyDisk,
  search: MagnifyingGlass,
  wrench: Wrench,
  image: ImageGlyph,
  scroll: Scroll,
  upload: UploadSimple,
} as const;

export type IconName = keyof typeof ICONS;

export function isIconName(v: unknown): v is IconName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ICONS, v);
}

interface Props extends Omit<IconProps, "weight" | "ref"> {
  name: IconName;
  /** accessible name; omit for decorative icons next to a text label */
  label?: string;
}

export function Icon({ name, size = 18, label, className, ...rest }: Props) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      weight="bold"
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      {...rest}
    />
  );
}
