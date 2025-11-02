export interface StoryOption {
  text: string;
  target: string;
}

export interface StoryReward {
  gid: string;
  amount?: number;
  max?: number;
  message?: string;
  limitMessage?: string;
}

export interface StoryNodeEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface StoryNode {
  id: string;
  speaker: string;
  text: string;
  next?: string;
  options?: StoryOption[];
  reward?: StoryReward;
  events?: StoryNodeEvent[];
  destroy?: boolean;
}

export interface StoryData {
  id?: string;
  title?: string;
  start: string;
  nodes: StoryNode[];
}
