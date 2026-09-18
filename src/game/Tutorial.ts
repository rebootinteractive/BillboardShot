import type { TutorialStep } from './level';

/**
 * The pointing hand that teaches the first two inputs.
 *
 * A hand is worth more than a sentence here: the two things a new player has to discover
 * are physical, tapping a lane and dragging the carousel round, and both are easier shown
 * than described. The hand loops its gesture until the player does it once, then leaves
 * and never comes back — these levels are the only ones with a tutorial.
 */
export class Tutorial {
  private readonly root: HTMLDivElement;
  private readonly hand: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private step: TutorialStep | null = null;
  private done = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay tutorial-layer';
    this.root.innerHTML = `
      <div class="tut-hand" data-hand>
        <svg viewBox="0 0 48 60" width="48" height="60" aria-hidden="true">
          <path d="M18 34V10a5 5 0 0 1 10 0v16" />
          <path d="M28 26v-4a4.5 4.5 0 0 1 9 0v16c0 9-5 16-14 16s-14-6-14-14v-9a4.5 4.5 0 0 1 9 0" />
        </svg>
      </div>
      <div class="tut-caption" data-caption></div>
    `;
    parent.appendChild(this.root);
    this.hand = this.root.querySelector('[data-hand]')!;
    this.caption = this.root.querySelector('[data-caption]')!;
    this.root.style.display = 'none';
  }

  /** Start teaching a step. Does nothing once the player has performed it. */
  show(step: TutorialStep) {
    this.step = step;
    this.done = false;
    this.root.style.display = '';
    this.hand.classList.remove('tap', 'swipe');
    // Restarting the animation needs a reflow between removing and adding the class.
    void this.hand.offsetWidth;
    this.hand.classList.add(step === 'send' ? 'tap' : 'swipe');
    this.caption.textContent = step === 'send'
      ? 'Tap a line to send its container'
      : 'Drag to turn the billboards';
  }

  /** Point the hand at a place on screen, in CSS pixels relative to the canvas. */
  moveTo(x: number, y: number) {
    this.hand.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** The player did the thing. Fade out for good. */
  complete() {
    if (this.done || !this.step) return;
    this.done = true;
    this.step = null;
    this.root.classList.add('tut-out');
    window.setTimeout(() => {
      this.root.style.display = 'none';
      this.root.classList.remove('tut-out');
    }, 400);
  }

  /** True while a step is still being taught. */
  get active() {
    return this.step !== null;
  }

  get current() {
    return this.step;
  }

  hide() {
    this.step = null;
    this.done = false;
    this.root.style.display = 'none';
    this.root.classList.remove('tut-out');
  }

  dispose() {
    this.root.remove();
  }
}
