export type ConfigFile = {
  version: string;
  projects: ConfigProject[];
};

export type ConfigProject = {
  path: string;
  name: string;
};
