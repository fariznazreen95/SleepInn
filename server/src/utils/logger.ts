export const log = (...args: any[]) => {
    // keep super simple; includes timestamp
    console.log(new Date().toISOString(), ...args);
  };
  