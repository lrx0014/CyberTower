import dialogueBox from './dialogueBox';
import { StoryData, StoryNode } from './storyTypes';

interface StoryManagerOptions {
  onStart?: () => void;
  onEnd?: () => void;
  basePath?: string;
  grantItem?: (gid: string, amount: number, max?: number) => StoryGrantResult;
  getInventoryName?: (gid: string, fallback?: string) => string;
}

interface StoryGrantResult {
  success: boolean;
  granted: number;
  current: number;
}

interface RenderOptions {
  speaker: string;
  text: string;
  options: { text: string }[];
  canPrev: boolean;
  canNext: boolean;
  showClose: boolean;
}

class StoryManager {
  private active = false;
  private nodes = new Map<string, StoryNode>();
  private history: string[] = [];
  private currentNode: StoryNode | null = null;
  private callbacks: StoryManagerOptions = {};
  private basePath = '/assets/story';
  private initialised = false;
  private rewardMessages = new Map<string, string | null>();

  init(options: StoryManagerOptions = {}) {
    if (!this.initialised) {
      dialogueBox.init();
      dialogueBox.setHandlers({
        onNext: () => this.next(),
        onPrev: () => this.prev(),
        onOption: (index) => this.choose(index),
        onClose: () => this.end()
      });
      this.initialised = true;
    }
    this.callbacks = options;
    if (options.basePath) {
      this.basePath = options.basePath;
    }
  }

  isActive() {
    return this.active;
  }

  async start(storyId: string): Promise<boolean> {
    if (!this.initialised) {
      this.init();
    }
    if (this.active) {
      await this.end();
    }
    try {
      const story = await this.loadStory(storyId);
      if (!story) {
        console.error(`[story] Story not found: ${storyId}`);
        return false;
      }
      this.active = true;
      this.callbacks.onStart?.();
      this.nodes.clear();
      this.rewardMessages.clear();
      story.nodes.forEach((node) => this.nodes.set(node.id, node));
      this.history = [story.start];
      this.setNode(story.start, false);
      return true;
    } catch (err) {
      console.error('[story] Failed to start story', storyId, err);
      return false;
    }
  }

  private async loadStory(id: string): Promise<StoryData | null> {
    const url = `${this.basePath}/${id}.json?cb=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as StoryData;
  }

  private setNode(nodeId: string, pushHistory = true) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      console.warn('[story] Missing node', nodeId);
      this.end();
      return;
    }
    if (pushHistory) {
      this.history.push(nodeId);
    }
    this.currentNode = node;
    const rewardMessage = this.processReward(node);
    this.rewardMessages.set(nodeId, rewardMessage);
    this.render();
  }

  private render() {
    if (!this.currentNode) return;
    const options = this.currentNode.options ?? [];
    const hasOptions = options.length > 0;
    const canPrev = this.history.length > 1;
    const canNext = !hasOptions && !!this.currentNode.next;
    const showClose = !hasOptions && !this.currentNode.next;

    const rewardMessage = this.rewardMessages.get(this.currentNode.id);
    const displayText = rewardMessage ? `${this.currentNode.text}\n${rewardMessage}` : this.currentNode.text;

    const state: RenderOptions = {
      speaker: this.currentNode.speaker,
      text: displayText,
      options: options.map((opt) => ({ text: opt.text })),
      canPrev,
      canNext,
      showClose
    };

    dialogueBox.show(state);
  }

  private next() {
    if (!this.currentNode) return;
    if (this.currentNode.options && this.currentNode.options.length > 0) {
      return;
    }
    if (this.currentNode.next) {
      this.setNode(this.currentNode.next);
    } else {
      this.end();
    }
  }

  private prev() {
    if (!this.currentNode || this.history.length <= 1) return;
    this.history.pop(); // remove current
    const previousId = this.history[this.history.length - 1];
    this.setNode(previousId, false);
  }

  private choose(index: number) {
    if (!this.currentNode || !this.currentNode.options) return;
    const option = this.currentNode.options[index];
    if (!option) return;
    this.setNode(option.target);
  }

  private processReward(node: StoryNode): string | null {
    const reward = node.reward;
    if (!reward) return null;
    if (this.rewardMessages.has(node.id)) {
      return this.rewardMessages.get(node.id) ?? null;
    }
    const amount = reward.amount ?? 1;
    const max = reward.max;
    const defaultName = this.callbacks.getInventoryName?.(reward.gid) ?? reward.gid;

    if (!this.callbacks.grantItem) {
      return reward.message ?? `Received ${amount} ${defaultName}.`;
    }

    const result = this.callbacks.grantItem(reward.gid, amount, max);
    if (result.success) {
      const grantedAmount = result.granted ?? amount;
      if (reward.message) return reward.message;
      const quantityText = grantedAmount > 1 ? `${grantedAmount} × ${defaultName}` : defaultName;
      return `Received ${quantityText}.`;
    }

    if (reward.limitMessage) {
      return reward.limitMessage;
    }

    const limitAmount = reward.max ?? result.current ?? 0;
    if (limitAmount > 0) {
      return `You already have the maximum number of ${defaultName} (${limitAmount}).`;
    }
    return `You already have enough ${defaultName}.`;
  }

  async end() {
    if (!this.active) return;
    this.active = false;
    this.currentNode = null;
    this.history = [];
    this.rewardMessages.clear();
    dialogueBox.hide();
    this.callbacks.onEnd?.();
  }
}

const storyManager = new StoryManager();
export default storyManager;
