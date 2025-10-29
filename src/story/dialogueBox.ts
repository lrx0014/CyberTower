interface DialogueRenderState {
  speaker: string;
  text: string;
  options: { text: string }[];
  canPrev: boolean;
  canNext: boolean;
  showClose: boolean;
}

interface DialogueHandlers {
  onNext?: () => void;
  onPrev?: () => void;
  onOption?: (index: number) => void;
  onClose?: () => void;
}

class DialogueBox {
  private root: HTMLElement | null = null;
  private speakerEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private optionsEl: HTMLElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private handlers: DialogueHandlers = {};
  private initialised = false;

  init() {
    if (this.initialised) return;
    this.root = document.getElementById('dialogue');
    this.speakerEl = document.getElementById('dialogue-speaker');
    this.textEl = document.getElementById('dialogue-text');
    this.optionsEl = document.getElementById('dialogue-options');
    this.prevBtn = document.getElementById('dialogue-prev') as HTMLButtonElement | null;
    this.nextBtn = document.getElementById('dialogue-next') as HTMLButtonElement | null;
    this.closeBtn = document.getElementById('dialogue-close') as HTMLButtonElement | null;

    if (!this.root || !this.speakerEl || !this.textEl || !this.optionsEl || !this.prevBtn || !this.nextBtn || !this.closeBtn) {
      throw new Error('Dialogue UI failed to mount.');
    }

    this.prevBtn.addEventListener('click', () => {
      this.handlers.onPrev?.();
    });
    this.nextBtn.addEventListener('click', () => {
      if (this.nextBtn?.dataset.action === 'close') {
        this.handlers.onClose?.();
      } else {
        this.handlers.onNext?.();
      }
    });
    this.closeBtn.addEventListener('click', () => {
      this.handlers.onClose?.();
    });
    this.optionsEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const optionIndex = target.dataset.optionIndex;
      if (optionIndex) {
        const index = Number.parseInt(optionIndex, 10);
        if (!Number.isNaN(index)) {
          this.handlers.onOption?.(index);
        }
      }
    });

    this.initialised = true;
  }

  setHandlers(handlers: DialogueHandlers) {
    this.handlers = handlers;
  }

  show(state: DialogueRenderState) {
    this.ensureInitialised();
    if (!this.root || !this.speakerEl || !this.textEl || !this.optionsEl || !this.prevBtn || !this.nextBtn) return;

    this.root.classList.remove('hidden');
    this.speakerEl.textContent = state.speaker;
    this.textEl.textContent = state.text;

    this.optionsEl.innerHTML = '';
    if (state.options.length > 0) {
      this.optionsEl.classList.remove('hidden');
      state.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dialogue-option';
        btn.dataset.optionIndex = `${index}`;
        btn.textContent = option.text;
        this.optionsEl?.appendChild(btn);
      });
      this.nextBtn.dataset.action = state.showClose ? 'close' : 'next';
      this.nextBtn.disabled = !state.canNext && !state.showClose;
    } else {
      this.optionsEl.classList.add('hidden');
      this.nextBtn.disabled = state.showClose ? false : !state.canNext;
      this.nextBtn.dataset.action = state.showClose ? 'close' : 'next';
    }

    this.prevBtn.disabled = !state.canPrev;
    this.prevBtn.classList.toggle('hidden', !state.canPrev);
    this.nextBtn.classList.toggle('hidden', state.options.length > 0 && !state.canNext && !state.showClose);
    this.nextBtn.textContent = state.showClose ? 'Close' : 'Next';
  }

  hide() {
    this.ensureInitialised();
    this.root?.classList.add('hidden');
  }

  private ensureInitialised() {
    if (!this.initialised) {
      this.init();
    }
  }
}

const dialogueBox = new DialogueBox();
export default dialogueBox;
