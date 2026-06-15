import { Composition } from "remotion";
import { Lesson_e9cf6f38 } from "./compositions/Lesson_e9cf6f38";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Lesson_e9cf6f38"
      component={Lesson_e9cf6f38}
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