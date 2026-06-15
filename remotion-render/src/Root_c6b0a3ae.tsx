import { Composition } from "remotion";
import { Lesson_c6b0a3ae } from "./compositions/Lesson_c6b0a3ae";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Lesson_c6b0a3ae"
      component={Lesson_c6b0a3ae}
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