import { Composition } from "remotion";
import { Lesson_757b5682 } from "./compositions/Lesson_757b5682";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Lesson_757b5682"
      component={Lesson_757b5682}
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