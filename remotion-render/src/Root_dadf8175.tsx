import { Composition } from "remotion";
import { Lesson_dadf8175 } from "./compositions/Lesson_dadf8175";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Lesson_dadf8175"
      component={Lesson_dadf8175}
      durationInFrames={9000}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "",
        description: "",
        keyPoints: [],
        lessonNumber: 1,
        audioUrl: null,
      }}
    />
  );
};